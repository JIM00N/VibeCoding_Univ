"""POST /appointments 계약 테스트 (Story 2.1).

db 계층(fetch_doctor_department·insert_appointment)을 가짜로 바꿔 라우터→서비스→스키마
매핑·검증·슬롯 floor 만 검증한다. 실제 DB 연결·시크릿 없이 돈다.
lifespan(풀 오픈)을 트리거하지 않도록 TestClient 를 context manager 없이 사용한다(test_patients 패턴).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import appointments as appointments_db
from app.db import refdata as refdata_db
from app.db.availability import NoFreeDoctorError, SlotTakenError
from app.main import app


def _fake_row(**over):
    row = {
        "id": 10,
        "patient_id": 1,
        "hospital_department_id": 2,
        "doctor_id": 3,
        "reserved_at": datetime(2026, 7, 20, 1, 30, tzinfo=timezone.utc),
        "status": "대기",
        "patient_name": "이수민",
        "doctor_name": "김민재",
        "department_name": "이비인후과",
    }
    row.update(over)
    return row


def _fail(*args, **kwargs):
    raise AssertionError("이 db 함수는 호출되면 안 됩니다(서비스 검증에서 먼저 막힘).")


def _future_at(hour: int, minute: int, second: int = 0) -> datetime:
    """내일(UTC)의 지정 시각 — Story 5.1 과거 시각 가드(생성 전용)를 통과하는 미래 시각.

    생성 경로 테스트는 고정 날짜를 쓰면 시간이 지나 과거가 되는 순간 400 으로 깨진다(테스트 부패).
    """
    base = datetime.now(timezone.utc) + timedelta(days=1)
    return base.replace(hour=hour, minute=minute, second=second, microsecond=0)


def _future_iso(hour: int, minute: int, second: int = 0) -> str:
    return _future_at(hour, minute, second).isoformat().replace("+00:00", "Z")


def test_create_appointment_returns_flat_canonical_shape(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    def fake_insert(patient_id, hospital_department_id, doctor_id, reserved_at):
        return _fake_row(
            patient_id=patient_id,
            hospital_department_id=hospital_department_id,
            doctor_id=doctor_id,
            reserved_at=reserved_at,
        )

    monkeypatch.setattr(appointments_db, "insert_appointment", fake_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": _future_iso(1, 30),
        },
    )

    assert resp.status_code == 201
    data = resp.json()
    # AD-10: flat 정규 모델 — FK 정수 id + 평평한 표시 필드. nested 금지.
    assert set(data.keys()) == {
        "id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "reserved_at",
        "status",
        "patient_name",
        "doctor_name",
        "department_name",
    }
    assert isinstance(data["id"], int)
    assert data["doctor_id"] == 3
    # 생성 직후 상태는 대기(AC1). 클라이언트가 status 를 정할 수 없다.
    assert data["status"] == "대기"
    assert data["patient_name"] == "이수민"
    assert data["doctor_name"] == "김민재"
    assert data["department_name"] == "이비인후과"


def test_create_appointment_floors_reserved_at_to_slot(monkeypatch):
    # AC4: off-grid 시각(10:17:42)이 30분 격자로 floor 되어 db 에 전달돼야 DB CHECK 를 통과한다.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    captured: dict = {}

    def fake_insert(patient_id, hospital_department_id, doctor_id, reserved_at):
        captured["reserved_at"] = reserved_at
        return _fake_row(reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "insert_appointment", fake_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            # 기준 시각을 1회만 고정한다 — 요청 생성·assert 가 각각 now() 를 부르면 UTC 자정을
            # 사이에 두고 실행될 때 기준 날짜가 하루 어긋나는 플레이크가 된다(코드리뷰).
            "reserved_at": (base := _future_at(10, 17, 42)).isoformat().replace("+00:00", "Z"),
        },
    )

    assert resp.status_code == 201
    saved = captured["reserved_at"]
    # 분 ∈ {0,30}, 초 = 0 (appointment_reserved_at_slot_check 통과 조건).
    assert saved.minute in (0, 30)
    assert saved.second == 0
    assert saved == base.replace(minute=0, second=0)


def test_create_appointment_already_aligned_time_unchanged(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_insert(patient_id, hospital_department_id, doctor_id, reserved_at):
        captured["reserved_at"] = reserved_at
        return _fake_row(reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "insert_appointment", fake_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            # 기준 시각 1회 고정 — 자정 경계 플레이크 방지(위 floor 테스트와 동일 사유).
            "reserved_at": (base := _future_at(14, 30)).isoformat().replace("+00:00", "Z"),
        },
    )

    assert resp.status_code == 201
    assert captured["reserved_at"] == base


def test_create_appointment_doctor_wrong_department_rejected(monkeypatch):
    # 의사(3)의 소속은 2인데 요청 진료과가 1 → 소속 불일치 400. insert 호출 금지.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 1,
            "doctor_id": 3,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    body = resp.json()
    assert isinstance(body["detail"], str)
    assert "진료과" in body["detail"]


def test_create_appointment_unknown_doctor_rejected(monkeypatch):
    # 없는 의사 → fetch_doctor_department 가 None → 400. insert 호출 금지.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: None)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 999,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_create_appointment_missing_required_field_returns_422():
    # patient_id 누락 → Pydantic 필수 검증(422). 클라이언트는 제출 전 인라인으로 먼저 막음.
    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": _future_iso(10, 0),
        },
    )
    assert resp.status_code == 422


def test_create_appointment_unknown_patient_fk_maps_to_400(monkeypatch):
    # 없는 patient_id → INSERT 시 FK 위반. 전역 500 대신 400 한국어로 매핑돼야 한다(리뷰 patch).
    from psycopg.errors import ForeignKeyViolation

    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    def fk_insert(*args, **kwargs):
        raise ForeignKeyViolation(
            'insert or update on "appointment" violates foreign key constraint'
        )

    monkeypatch.setattr(appointments_db, "insert_appointment", fk_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 999999,
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    body = resp.json()
    assert isinstance(body["detail"], str)
    assert "환자" in body["detail"]


def test_create_appointment_none_row_maps_to_500(monkeypatch):
    # db 가 None 행을 주면(도달 불가지만 타입상 가능) TypeError 대신 500 한국어 {detail} 로 방어.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(appointments_db, "insert_appointment", lambda *a, **k: None)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 500
    assert isinstance(resp.json()["detail"], str)


# --- Story 2.2: GET /appointments (직원 목록) ---------------------------------


def test_list_appointments_returns_flat_canonical_list(monkeypatch):
    # AC1/AC3/AC4: 직원 전체 목록 → AppointmentOut flat 리스트. db 순서를 그대로 보존한다.
    rows = [
        _fake_row(id=11, status="대기"),
        _fake_row(id=10, status="확정", doctor_id=4, doctor_name="박서연"),
    ]
    monkeypatch.setattr(appointments_db, "fetch_appointments", lambda: rows)

    client = TestClient(app)
    resp = client.get("/appointments")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert [item["id"] for item in data] == [11, 10]
    # AD-10: 각 항목이 flat 정규 모델 — FK 정수 id + 평평한 표시 필드. nested 금지.
    assert set(data[0].keys()) == {
        "id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "reserved_at",
        "status",
        "patient_name",
        "doctor_name",
        "department_name",
    }
    assert data[1]["status"] == "확정"
    assert data[1]["doctor_name"] == "박서연"


def test_list_appointments_empty_returns_200_empty_list(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_appointments", lambda: [])

    client = TestClient(app)
    resp = client.get("/appointments")

    assert resp.status_code == 200
    assert resp.json() == []


# --- Story 4.1: GET /appointments?patient_id= (환자용 조회) --------------------


def test_list_appointments_by_patient_filters_and_returns_flat_list(monkeypatch):
    # AC1/AC6: ?patient_id= 이면 그 환자용 fetch 를 그 인자로 호출하고 flat 정규 리스트를 반환한다.
    # 직원 전체 fetch 는 호출되면 안 된다(경로 분기 회귀 가드).
    captured: dict = {}

    def fake_by_patient(patient_id):
        captured["patient_id"] = patient_id
        return [_fake_row(id=21, patient_id=patient_id, status="확정")]

    monkeypatch.setattr(appointments_db, "fetch_appointments_by_patient", fake_by_patient)
    monkeypatch.setattr(appointments_db, "fetch_appointments", _fail)

    client = TestClient(app)
    resp = client.get("/appointments", params={"patient_id": 7})

    assert resp.status_code == 200
    assert captured["patient_id"] == 7
    data = resp.json()
    assert isinstance(data, list) and len(data) == 1
    # AD-10: flat 정규 모델 — 직원 목록과 같은 키셋(리소스당 응답 모델 1개).
    assert set(data[0].keys()) == {
        "id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "reserved_at",
        "status",
        "patient_name",
        "doctor_name",
        "department_name",
    }
    assert data[0]["patient_id"] == 7


def test_list_appointments_by_patient_empty_returns_200_empty_list(monkeypatch):
    # 예약 없는 환자는 빈 목록 200(404 아님 — 목록 계약). 프런트가 빈 상태로 해석한다(AC4).
    monkeypatch.setattr(
        appointments_db, "fetch_appointments_by_patient", lambda pid: []
    )
    monkeypatch.setattr(appointments_db, "fetch_appointments", _fail)

    client = TestClient(app)
    resp = client.get("/appointments", params={"patient_id": 999})

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_appointments_without_patient_id_uses_full_list(monkeypatch):
    # 회귀: patient_id 없으면 기존 직원 전체 fetch 를 쓰고, 환자용 fetch 는 호출되면 안 된다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointments", lambda: [_fake_row(id=11)]
    )
    monkeypatch.setattr(appointments_db, "fetch_appointments_by_patient", _fail)

    client = TestClient(app)
    resp = client.get("/appointments")

    assert resp.status_code == 200
    assert resp.json()[0]["id"] == 11


# --- Story 6.1: GET /appointments?doctor_id= (의사 대시보드 스코핑) -------------
# 4.1 의 ?patient_id= 테스트 미러. 의사판 앱 레벨 필터(AD-8, 보안 아님).


def test_list_appointments_by_doctor_filters_and_returns_flat_list(monkeypatch):
    # AC2: ?doctor_id= 이면 그 의사용 fetch 를 그 인자로 호출하고 flat 정규 리스트를 반환한다.
    # 직원 전체 fetch·환자용 fetch 는 호출되면 안 된다(경로 분기 회귀 가드).
    captured: dict = {}

    def fake_by_doctor(doctor_id):
        captured["doctor_id"] = doctor_id
        return [_fake_row(id=31, doctor_id=doctor_id, status="확정")]

    monkeypatch.setattr(appointments_db, "fetch_appointments_by_doctor", fake_by_doctor)
    monkeypatch.setattr(appointments_db, "fetch_appointments", _fail)
    monkeypatch.setattr(appointments_db, "fetch_appointments_by_patient", _fail)

    client = TestClient(app)
    resp = client.get("/appointments", params={"doctor_id": 3})

    assert resp.status_code == 200
    assert captured["doctor_id"] == 3
    data = resp.json()
    assert isinstance(data, list) and len(data) == 1
    # AD-10: flat 정규 모델 — 직원·환자 목록과 같은 키셋(리소스당 응답 모델 1개).
    assert set(data[0].keys()) == {
        "id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "reserved_at",
        "status",
        "patient_name",
        "doctor_name",
        "department_name",
    }
    assert data[0]["doctor_id"] == 3


def test_list_appointments_by_doctor_empty_returns_200_empty_list(monkeypatch):
    # 배정 예약 없는 의사는 빈 목록 200(404 아님 — 목록 계약). 프런트가 빈 상태로 해석한다(AC4).
    monkeypatch.setattr(
        appointments_db, "fetch_appointments_by_doctor", lambda did: []
    )
    monkeypatch.setattr(appointments_db, "fetch_appointments", _fail)

    client = TestClient(app)
    resp = client.get("/appointments", params={"doctor_id": 999})

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_appointments_without_doctor_id_uses_full_list(monkeypatch):
    # 회귀: doctor_id 없으면 기존 직원 전체 fetch 를 쓰고, 의사용 fetch 는 호출되면 안 된다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointments", lambda: [_fake_row(id=11)]
    )
    monkeypatch.setattr(appointments_db, "fetch_appointments_by_doctor", _fail)

    client = TestClient(app)
    resp = client.get("/appointments")

    assert resp.status_code == 200
    assert resp.json()[0]["id"] == 11


# --- Story 2.2: PATCH /appointments/{id} (상태 전이 확정/취소) ------------------


def test_confirm_pending_appointment_transitions_to_confirmed(monkeypatch):
    # AC1: 대기 → 확정. fetch 로 현재 상태 확인 후 update 로 전이, 전이된 정규 모델 반환.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    captured: dict = {}

    def fake_update(appointment_id, new_status, allowed_sources):
        captured["args"] = (appointment_id, new_status)
        captured["allowed"] = allowed_sources
        return _fake_row(id=appointment_id, status=new_status)

    monkeypatch.setattr(appointments_db, "update_appointment_status", fake_update)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "확정"})

    assert resp.status_code == 200
    assert captured["args"] == (10, "확정")
    # compare-and-set: 확정은 대기에서만 허용 → UPDATE 에 그 출발 status 만 전달된다.
    assert "대기" in captured["allowed"]
    data = resp.json()
    assert data["status"] == "확정"
    assert data["id"] == 10


def test_cancel_confirmed_appointment_transitions_to_cancelled(monkeypatch):
    # AC2: 확정 → 취소(대기/확정에서 취소 가능).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="확정")
    )
    monkeypatch.setattr(
        appointments_db,
        "update_appointment_status",
        lambda aid, s, srcs: _fake_row(id=aid, status=s),
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "취소"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "취소"


def test_cancel_pending_appointment_transitions_to_cancelled(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(
        appointments_db,
        "update_appointment_status",
        lambda aid, s, srcs: _fake_row(id=aid, status=s),
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "취소"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "취소"


def test_patch_status_race_returns_409(monkeypatch):
    # 경합: fetch 시점엔 대기라 서비스 검증을 통과하지만, compare-and-set UPDATE 가 0행(None)을
    # 준다(그 사이 다른 요청이 status 를 바꿈) → 409 한국어. 금지 전이가 성립하지 않는다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(
        appointments_db, "update_appointment_status", lambda aid, s, srcs: None
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "확정"})

    assert resp.status_code == 409
    assert isinstance(resp.json()["detail"], str)


def test_confirm_already_confirmed_rejected(monkeypatch):
    # AC1: 확정 상태를 다시 확정 → 400. update 는 호출되면 안 된다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="확정")
    )
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "확정"})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_confirm_completed_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="완료")
    )
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "확정"})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_cancel_completed_rejected(monkeypatch):
    # AC2: 완료된 예약은 취소 불가 → 400. update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="완료")
    )
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "취소"})

    assert resp.status_code == 400
    assert "완료" in resp.json()["detail"]


def test_cancel_already_cancelled_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="취소")
    )
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "취소"})

    assert resp.status_code == 400
    assert "취소" in resp.json()["detail"]


def test_patch_disallowed_target_status_rejected(monkeypatch):
    # 완료 등 확정/취소 외 목표값 → 400. fetch·update 둘 다 호출되면 안 된다(화이트리스트가 먼저 막음).
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "완료"})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_patch_unknown_appointment_returns_404(monkeypatch):
    # 없는 예약 → fetch_appointment 가 None → 404. update 호출 금지.
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: None)
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/999", json={"status": "확정"})

    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)


def test_patch_missing_status_returns_422():
    # status 누락 → Pydantic 필수 검증(422). 프런트는 버튼으로만 확정/취소를 보낸다.
    client = TestClient(app)
    resp = client.patch("/appointments/10", json={})
    assert resp.status_code == 422


# --- Story 7.1: PATCH /appointments/{id}/reschedule (일정 변경 = 의사 + 시각) --------
# Story 2.3 의 PATCH /appointments/{id}/doctor 를 **대체**한다(폐기 — 제안서 §3.4).
# 아래 블록은 2.3 테스트의 이관본이다: 경로·페이로드만 바뀌고 의도는 보존된다. 세 건은
# 계약 자체가 바뀌어 의도를 새로 쓴다(같은 의사 400 → 무변경 400 · 필수 422 → 서비스 400).


def _resched_row(**over):
    """미래 슬롯을 가진 예약 행 — 시각 변경 테스트용(_fake_row 기본은 과거다)."""
    return _fake_row(reserved_at=_future_at(1, 30), **over)


def test_reschedule_doctor_only_on_pending_appointment(monkeypatch):
    # AC1/AC2: 대기 예약의 의사만 변경 — 시각은 현재 값 유지, status 불변, 정규 모델 반환.
    current = _fake_row(id=10, status="대기")
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: current)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, reserved_at, allowed_sources):
        captured["args"] = (appointment_id, doctor_id, reserved_at)
        captured["allowed"] = allowed_sources
        return _fake_row(
            id=appointment_id, status="대기", doctor_id=doctor_id, doctor_name="박서연"
        )

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", fake_update)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 200
    # 시각 미지정 → 현재 값을 그대로 다시 쓴다(SQL 분기 없음 — 서비스가 유효값을 합성).
    assert captured["args"] == (10, 4, current["reserved_at"])
    # compare-and-set: 대기·확정에서만 변경 허용 → UPDATE 에 그 출발 status 들이 전달된다.
    assert "대기" in captured["allowed"] and "확정" in captured["allowed"]
    data = resp.json()
    # 응답에 새 doctor_id 와 doctor_name 이 함께 와야 색 배지(2.4)가 정합된다.
    assert data["doctor_id"] == 4
    assert data["doctor_name"] == "박서연"
    # status·진료과는 불변(AD-5, 과 이동 없음).
    assert data["status"] == "대기"
    assert data["hospital_department_id"] == 2


def test_reschedule_time_only_keeps_current_doctor(monkeypatch):
    # AC2 신규: 시각만 변경 — 의사는 현재 값 유지. doctor_id 미지정은 "자동 배정"이 아니다(5.2 는
    # 생성 전용). 의사가 안 바뀌므로 소속 검증 db 호출도 없어야 한다.
    current = _fake_row(id=10, status="확정", doctor_id=3)
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: current)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, reserved_at, allowed_sources):
        captured["args"] = (appointment_id, doctor_id, reserved_at)
        return _fake_row(id=appointment_id, status="확정", doctor_id=doctor_id,
                         reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", fake_update)

    new_at = _future_at(4, 0)
    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={"reserved_at": new_at.isoformat().replace("+00:00", "Z")},
    )

    assert resp.status_code == 200
    assert captured["args"] == (10, 3, new_at)
    assert resp.json()["status"] == "확정"


def test_reschedule_both_fields_at_once(monkeypatch):
    # AC1/AC2: 의사와 시각을 한 요청에서 함께 바꾼다(한 SQL 문 — 부분 실패 없음).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _resched_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, reserved_at, allowed_sources):
        captured["args"] = (appointment_id, doctor_id, reserved_at)
        return _fake_row(id=appointment_id, doctor_id=doctor_id, reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", fake_update)

    new_at = _future_at(5, 30)
    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={"doctor_id": 4, "reserved_at": new_at.isoformat().replace("+00:00", "Z")},
    )

    assert resp.status_code == 200
    assert captured["args"] == (10, 4, new_at)


def test_reschedule_floors_reserved_at_to_30min_grid(monkeypatch):
    # AC1: 비정렬 입력은 to_slot 으로 floor 해야 003 의 reserved_at 30분 CHECK 를 통과한다
    # (2.1 생성 경로와 같은 규약, AD-3). floor 없이 원시값을 쓰면 원시 DB 에러가 난다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _resched_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, reserved_at, allowed_sources):
        captured["at"] = reserved_at
        return _fake_row(id=appointment_id, reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", fake_update)

    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={"reserved_at": _future_iso(6, 47, 13)},
    )

    assert resp.status_code == 200
    assert captured["at"] == _future_at(6, 30)


def test_reschedule_on_confirmed_appointment(monkeypatch):
    # AC1: 확정 예약도 변경 가능(대기·확정만).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="확정")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(
        appointments_db,
        "update_appointment_schedule",
        lambda aid, did, at, srcs: _fake_row(
            id=aid, status="확정", doctor_id=did, doctor_name="박서연"
        ),
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 200
    data = resp.json()
    assert data["doctor_id"] == 4
    assert data["status"] == "확정"


def test_reschedule_unknown_appointment_returns_404(monkeypatch):
    # 없는 예약 → fetch_appointment None → 404. 의사 조회·update 호출 금지.
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: None)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/999/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)


def test_reschedule_completed_rejected(monkeypatch):
    # AC3: 완료 예약은 변경 불가 → 400(2.3 문구 계승). 의사 조회·update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="완료")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 400
    assert "완료" in resp.json()["detail"]


def test_reschedule_cancelled_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="취소")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 400
    assert "취소" in resp.json()["detail"]


def test_reschedule_unknown_doctor_rejected(monkeypatch):
    # 없는 의사 → fetch_doctor_department None → 400(2.1 문구 재사용). update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: None)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 999})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_reschedule_wrong_department_rejected(monkeypatch):
    # 다른 진료과 의사(소속 1 ≠ 예약 진료과 2) → 400 "진료과"(2.1 문구 재사용). update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 1)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 5})

    assert resp.status_code == 400
    assert "진료과" in resp.json()["detail"]


def test_reschedule_no_change_rejected(monkeypatch):
    # AC2 **계약 변경**: 2.3 의 "이미 담당하고 있는 의사예요"(같은 의사 400)는 제거됐다 —
    # 의사를 그대로 두고 시각만 바꾸는 것이 정당한 요청이 됐기 때문. 대신 **둘 다 그대로**면
    # 400 으로 막는다. 의사가 안 바뀌었으므로 소속 검증도 update 도 호출되면 안 된다.
    current = _fake_row(id=10, status="대기", doctor_id=3)
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: current)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={
            "doctor_id": 3,
            "reserved_at": current["reserved_at"].isoformat().replace("+00:00", "Z"),
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "바뀐 내용이 없어요. 담당 의사나 진료 시간을 바꿔 주세요."


def test_reschedule_same_doctor_with_new_time_succeeds(monkeypatch):
    # AC2: 같은 의사를 명시적으로 보내도 **시각이 바뀌면** 성립한다 — 2.3 이 막던 조합이
    # 이제 정상 경로다(변경 다이얼로그가 현재 의사를 기본 선택으로 보내기 때문).
    monkeypatch.setattr(
        appointments_db,
        "fetch_appointment",
        lambda aid: _fake_row(id=aid, status="대기", doctor_id=3),
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, reserved_at, allowed_sources):
        captured["args"] = (doctor_id, reserved_at)
        return _fake_row(id=appointment_id, doctor_id=doctor_id, reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", fake_update)

    new_at = _future_at(7, 0)
    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={"doctor_id": 3, "reserved_at": new_at.isoformat().replace("+00:00", "Z")},
    )

    assert resp.status_code == 200
    assert captured["args"] == (3, new_at)


def test_reschedule_race_returns_409(monkeypatch):
    # 경합: fetch 시점엔 대기지만 CAS UPDATE 가 0행(None) — 그 사이 완료/취소로 바뀜 → 409.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(
        appointments_db, "update_appointment_schedule", lambda aid, did, at, srcs: None
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 409
    assert isinstance(resp.json()["detail"], str)


def test_reschedule_empty_body_returns_400(monkeypatch):
    # AC2 **계약 변경**: 2.3 은 doctor_id 필수라 누락이 422(Pydantic)였다. 7.1 은 둘 다
    # 선택이라 빈 요청이 스키마를 통과하므로, **서비스가 400 한국어**로 막는다 — 422 리스트
    # detail 은 lib/api.ts 가 일반 메시지로 바꿔 버려 직원이 이유를 못 본다(AD-10).
    # 가드는 fetch 보다 앞이라 db 는 일절 호출되면 안 된다.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_reschedule_rejects_extra_status_field(monkeypatch):
    # 엔드포인트 분리 고정(AD-5): /reschedule 에 status 를 동봉하면 조용히 무시하지 않고 422.
    # (extra="forbid" — 호출자가 "완료 전이도 됐다"고 오인하는 조용한 의도 유실 차단.) db 미호출.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule", json={"doctor_id": 4, "status": "완료"}
    )

    assert resp.status_code == 422


def test_doctor_endpoint_is_gone(monkeypatch):
    # AC9: 폐기 완결 — 옛 경로는 라우트가 없어 404(FastAPI 기본). 살아 있으면 두 게이트가
    # 같은 행을 놓고 경쟁하는 사본이 된다(Story 5.4 가 없앤 종류).
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 404
    assert not hasattr(appointments_db, "update_appointment_doctor")


def test_patch_status_rejects_extra_doctor_id_field(monkeypatch):
    # 역방향 고정: 상태 전이 라우트에 doctor_id 를 동봉하면 422 — 재배정은 /doctor 경로만 담당.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_status", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10", json={"status": "확정", "doctor_id": 9})

    assert resp.status_code == 422


def test_get_single_appointment_returns_canonical_shape(monkeypatch):
    # GET /appointments/{id} (Story 3.1) — 진료 기록 페이지가 대상 예약을 로드한다.
    monkeypatch.setattr(
        appointments_db,
        "fetch_appointment",
        lambda aid: _fake_row(id=aid, status="확정"),
    )

    client = TestClient(app)
    resp = client.get("/appointments/10")

    assert resp.status_code == 200
    data = resp.json()
    # AD-10: 목록·PATCH 와 동일한 AppointmentOut 정규 모델(리소스당 응답 모델 1개).
    assert set(data.keys()) == {
        "id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "reserved_at",
        "status",
        "patient_name",
        "doctor_name",
        "department_name",
    }
    assert data["id"] == 10
    assert data["status"] == "확정"


def test_get_single_appointment_unknown_returns_404(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: None)

    client = TestClient(app)
    resp = client.get("/appointments/999")

    assert resp.status_code == 404
    # FastAPI 기본 "Not Found" 가 아니라 서비스의 한국어 {detail} 이어야 한다(AD-10).
    assert resp.json()["detail"] == "예약을 찾을 수 없어요."


# --- Story 5.1: 가용성 충돌 검사 (충돌 409 · 과거 400 · 의사 변경 재검사) --------


def test_create_appointment_slot_conflict_returns_409(monkeypatch):
    # 이미 점유된 (의사, 슬롯) → db 게이트가 SlotTakenError → 409 한국어(문구 정본은 서버).
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    def taken_insert(*args, **kwargs):
        raise SlotTakenError()

    monkeypatch.setattr(appointments_db, "insert_appointment", taken_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요."


def test_create_appointment_past_slot_returns_400_without_db(monkeypatch):
    # 과거 시각 서버 가드(AC7) — 6.3 High "지난 슬롯 예약 가능"의 서버측 마감.
    # 가드는 to_slot 직후·의사 검증 이전이므로 db 는 일절 호출되면 안 된다.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 3,
            "reserved_at": "2026-07-20T10:00:00Z",  # 고정 과거 — 이 테스트의 의도된 입력
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "이미 지난 시간이에요. 다른 시간을 골라 주세요."


def test_reschedule_slot_conflict_returns_409_with_doctor_message(monkeypatch):
    # 새 (의사, 슬롯)이 이미 점유 → 409. CAS 409("예약 상태가 방금 바뀌었어요…")와 문구로 구분.
    monkeypatch.setattr(
        appointments_db,
        "fetch_appointment",
        lambda i: _fake_row(status="대기", doctor_id=3),
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda d: 2)

    def taken_update(*args, **kwargs):
        raise SlotTakenError()

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", taken_update)

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail == "이 시간엔 선택한 의사의 예약이 이미 있어요. 다른 의사를 선택해 주세요."
    assert detail != "예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요."


def test_reschedule_patient_slot_conflict_returns_409(monkeypatch):
    # AC5: 그 환자가 **새 슬롯**에 이미 다른 활성 예약을 갖고 있으면 006 부분 유니크 인덱스가
    # UPDATE 를 거부한다(인덱스는 INSERT 전용이 아니다). 매핑은 생성 경로와 **같은 함수**
    # (_reject_unique_violation — 제약 이름 확인 포함)라 문구가 바이트 동일해야 한다.
    from psycopg.errors import UniqueViolation

    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda i: _fake_row(status="대기", doctor_id=3)
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda d: 2)

    def dup_update(*args, **kwargs):
        raise UniqueViolation(
            'duplicate key value violates unique constraint "uq_appointment_patient_slot"'
        )

    monkeypatch.setattr(appointments_db, "update_appointment_schedule", dup_update)

    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule", json={"reserved_at": _future_iso(9, 0)}
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail == "이 환자는 그 시간에 이미 다른 예약이 있어요. 다른 시간을 골라 주세요."
    # 슬롯 관련 기존 409 셋 모두와 달라야 한다(주어가 "환자"임을 밝히는 문구 — 코드리뷰 High).
    assert detail != "이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 선택한 의사의 예약이 이미 있어요. 다른 의사를 선택해 주세요."


def test_reschedule_past_appointment_doctor_only_still_allowed(monkeypatch):
    # AC6 **회귀 가드**: 과거 시각 가드는 `reserved_at` 이 실제로 올 때만 적용한다.
    # 2.3 이 고정했던 "과거 예약의 의사 변경 허용"이 7.1 에서도 살아 있어야 한다
    # (_fake_row 기본 reserved_at 은 과거). 가드를 무조건 걸면 이 테스트가 깨진다.
    monkeypatch.setattr(
        appointments_db,
        "fetch_appointment",
        lambda i: _fake_row(status="대기", doctor_id=3),
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda d: 2)
    monkeypatch.setattr(
        appointments_db,
        "update_appointment_schedule",
        lambda appointment_id, doctor_id, reserved_at, allowed_sources: _fake_row(
            doctor_id=doctor_id, doctor_name="박서연"
        ),
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10/reschedule", json={"doctor_id": 4})

    assert resp.status_code == 200
    assert resp.json()["doctor_id"] == 4


def test_reschedule_to_past_slot_returns_400_without_db(monkeypatch):
    # AC6: 새 시각이 이미 지났으면 400 — 생성 경로(create_appointment)와 **바이트 동일 문구**.
    # 가드는 의사 소속 검증·UPDATE 보다 앞이라 그 db 함수들은 호출되면 안 된다.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda i: _fake_row(status="대기", doctor_id=3)
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_schedule", _fail)

    client = TestClient(app)
    resp = client.patch(
        "/appointments/10/reschedule",
        json={"reserved_at": "2026-07-20T10:00:00Z"},  # 고정 과거 — 의도된 입력
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "이미 지난 시간이에요. 다른 시간을 골라 주세요."


def test_insert_appointment_rejects_none_doctor_id():
    # 코드리뷰: NULL doctor_id 는 게이트 조각(`a.doctor_id = NULL`)을 무력화한다 — db 계층이
    # 커넥션을 열기 전에 명시 거부(서비스 400 뒤의 2차 방어선, 5.2 직접 호출자 대비).
    with pytest.raises(ValueError):
        appointments_db.insert_appointment(
            1, 2, None, datetime(2026, 8, 1, 1, 0, tzinfo=timezone.utc)
        )


def test_schedule_update_interpretation_prefers_cas_over_slot_conflict():
    # 코드리뷰: CAS 불일치 + 슬롯 충돌 이중 경합 → None(CAS 409 경로) 우선 — 슬롯 409 의
    # "다른 의사를 선택해 주세요"는 이 경우 따라도 성공할 수 없는 오도 안내이기 때문.
    assert (
        appointments_db._interpret_schedule_update_row(
            {"slot_taken": True, "cas_ok": False, "id": None}
        )
        is None
    )


def test_schedule_update_interpretation_slot_conflict_and_success_paths():
    # CAS 통과 + 슬롯 충돌 → SlotTakenError(서비스가 슬롯 409 로 매핑).
    with pytest.raises(SlotTakenError):
        appointments_db._interpret_schedule_update_row(
            {"slot_taken": True, "cas_ok": True, "id": None}
        )
    # 정상 갱신 행은 해석 플래그 2개(slot_taken·cas_ok)를 벗겨 기존 행 계약 그대로 돌려준다.
    row = appointments_db._interpret_schedule_update_row(
        {"slot_taken": False, "cas_ok": True, "id": 10, "doctor_id": 4}
    )
    assert row == {"id": 10, "doctor_id": 4}


# --- Story 5.2: 의사 자동 배정 (미선택 → 자동 배정 · 전원 점유 409 · 빈 과 400) --------
# 미선택 400("담당 의사를 선택해 주세요.")을 고정하던 기존 테스트는 이 섹션이 대체한다 —
# FR-6 P1 이 예고한 유일한 의도적 계약 변경(스토리 AC4).


def test_create_appointment_auto_assign_returns_201_with_assigned_doctor(monkeypatch):
    # doctor_id=null → 자동 배정 경로: 지정용 insert 는 절대 호출되지 않고, 자동 문이
    # (patient, hd, floor 슬롯) 을 받아 배정된 의사로 채운 행을 돌려준다(FR-6 P1).
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)
    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [{"id": 3}, {"id": 4}])

    captured: dict = {}

    def fake_auto(patient_id, hospital_department_id, reserved_at):
        captured.update(
            patient_id=patient_id,
            hospital_department_id=hospital_department_id,
            reserved_at=reserved_at,
        )
        return _fake_row(reserved_at=reserved_at)

    monkeypatch.setattr(appointments_db, "insert_appointment_auto", fake_auto)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": None,
            # off-grid 시각 — 자동 경로도 floor 해서 db 에 넘겨야 한다(AD-3).
            "reserved_at": (base := _future_at(10, 17, 42)).isoformat().replace("+00:00", "Z"),
        },
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["doctor_id"] == 3  # 배정된 의사가 채워진다(응답 모델 무변경, AD-10).
    assert data["doctor_name"] == "김민재"
    assert captured["patient_id"] == 1
    assert captured["hospital_department_id"] == 2
    assert captured["reserved_at"] == base.replace(minute=0, second=0)


def test_create_appointment_auto_assign_field_omitted_same_path(monkeypatch):
    # doctor_id 필드 자체를 생략해도(스키마 기본 None) 같은 자동 배정 경로다.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)
    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [{"id": 3}])
    monkeypatch.setattr(
        appointments_db,
        "insert_appointment_auto",
        lambda patient_id, hospital_department_id, reserved_at: _fake_row(
            reserved_at=reserved_at
        ),
    )

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "reserved_at": _future_iso(11, 30),
        },
    )

    assert resp.status_code == 201
    assert resp.json()["doctor_id"] == 3


def test_create_appointment_auto_all_taken_returns_409(monkeypatch):
    # 그 슬롯에 과 전 의사 점유 → 409. 기존 두 409(생성 충돌·의사 변경 충돌)와 문구로 구분(AC2).
    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [{"id": 3}, {"id": 4}])

    def no_free(*args, **kwargs):
        raise NoFreeDoctorError()

    monkeypatch.setattr(appointments_db, "insert_appointment_auto", no_free)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": None,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail == "이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 선택한 의사의 예약이 이미 있어요. 다른 의사를 선택해 주세요."


def test_create_appointment_auto_empty_department_returns_400(monkeypatch):
    # 진료과에 의사 0명 → 점유가 아닌 요청 결함 400(시드는 과당 2명이라 데모 도달 불가 — 500 방지).
    # 자동 문은 호출되면 안 된다(선검증).
    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [])
    monkeypatch.setattr(appointments_db, "insert_appointment_auto", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": None,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "이 진료과엔 등록된 의사가 없어요. 다른 진료과를 골라 주세요."


def test_create_appointment_auto_past_slot_returns_400_without_db(monkeypatch):
    # 과거 시각 가드는 자동 경로에도 선행한다(AC1) — 의사 목록 조회·자동 문 모두 미호출.
    monkeypatch.setattr(refdata_db, "fetch_doctors", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment_auto", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": None,
            "reserved_at": "2026-07-20T10:00:00Z",  # 고정 과거 — 의도된 입력
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "이미 지난 시간이에요. 다른 시간을 골라 주세요."


def test_create_appointment_doctor_zero_uses_existing_validation_path(monkeypatch):
    # doctor_id=0 은 자동 배정이 아니다(분기는 is None) — 기존 검증 경로에서 "없는 의사" 400.
    # 종전 falsy 검사에선 "선택해 주세요" 였던 크래프트 입력의 문구 변화(의도·정직 기록, AC4).
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: None)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment_auto", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 0,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "담당 의사를 찾을 수 없어요. 다시 선택해 주세요."


def test_auto_insert_interpretation_paths():
    # 자동 배정 문 결과 해석(순수 함수 — _interpret_schedule_update_row 미러, DB 불필요).
    # 빈 의사 없음(free_found=false) → NoFreeDoctorError(서비스가 409 로 매핑).
    with pytest.raises(NoFreeDoctorError):
        appointments_db._interpret_auto_insert_row({"free_found": False, "id": None})
    # 정상 삽입 행은 해석 플래그를 벗겨 기존 행 계약 그대로 돌려준다.
    row = appointments_db._interpret_auto_insert_row(
        {"free_found": True, "id": 10, "doctor_id": 3}
    )
    assert row == {"id": 10, "doctor_id": 3}
    # 방어 경로: fetchone None·게이트 통과 후 0행 — 기존 None 계약(서비스 500 방어) 유지.
    assert appointments_db._interpret_auto_insert_row(None) is None
    assert (
        appointments_db._interpret_auto_insert_row({"free_found": True, "id": None}) is None
    )


def test_create_appointment_auto_unknown_patient_fk_maps_to_400(monkeypatch):
    # 자동 경로도 없는 patient_id 의 FK 위반을 전역 500 이 아닌 400 한국어로 매핑해야 한다 —
    # 직접 선택 경로 테스트(:215)의 자동판(코드리뷰: 커버리지 갭 150-152행).
    from psycopg.errors import ForeignKeyViolation

    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [{"id": 3}])

    def fk_auto(*args, **kwargs):
        raise ForeignKeyViolation(
            'insert or update on "appointment" violates foreign key constraint'
        )

    monkeypatch.setattr(appointments_db, "insert_appointment_auto", fk_auto)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 999999,
            "hospital_department_id": 2,
            "doctor_id": None,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "선택한 환자 정보를 찾을 수 없어요. 환자를 다시 선택해 주세요."


# --- chore(2026-07-28): 환자 1인 동시 예약 금지 (부분 유니크 인덱스 → 409) -----------
# 실 보증은 db/migrations/006 의 인덱스 + curl 실증이 담당한다 — 아래 두 테스트는 db 를
# monkeypatch 하므로 "UniqueViolation 이 올라오면 409 한국어로 매핑되는가"만 고정한다
# (계약 테스트의 한계는 .claude/rules/backend.md 참조).


def test_create_appointment_patient_slot_conflict_returns_409(monkeypatch):
    # 같은 환자가 같은 슬롯에 다른 의사로 재예약 → 006 인덱스가 UniqueViolation.
    # 전역 500 이 아니라 409 한국어여야 하고, 기존 세 409 와 문구로 구분돼야 한다.
    from psycopg.errors import UniqueViolation

    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    def dup_insert(*args, **kwargs):
        raise UniqueViolation(
            'duplicate key value violates unique constraint "uq_appointment_patient_slot"'
        )

    monkeypatch.setattr(appointments_db, "insert_appointment", dup_insert)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": 4,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    # 문구가 주어("이 환자는")를 밝혀야 한다 — 직원이 "의사가 찼다"로 읽으면 의사를 바꿔
    # 재시도하고 또 실패한다(코드리뷰 High).
    assert detail == "이 환자는 그 시간에 이미 다른 예약이 있어요. 다른 시간을 골라 주세요."
    # 슬롯 관련 기존 409 **셋 모두**와 달라야 한다(코드리뷰: 이전엔 셋 중 둘만 비교했다).
    assert detail != "이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 모든 의사의 예약이 차 있어요. 다른 시간을 골라 주세요."
    assert detail != "이 시간엔 선택한 의사의 예약이 이미 있어요. 다른 의사를 선택해 주세요."


def test_create_appointment_auto_patient_slot_conflict_returns_409(monkeypatch):
    # 자동 배정도 같은 매핑이어야 한다 — pick 은 "그 의사가 빈가"만 보므로 환자 중복은
    # 인덱스가 잡는다(직접 선택 경로 테스트의 자동판, FK 매핑 쌍과 같은 구조).
    from psycopg.errors import UniqueViolation

    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hd: [{"id": 3}, {"id": 4}])

    def dup_auto(*args, **kwargs):
        raise UniqueViolation(
            'duplicate key value violates unique constraint "uq_appointment_patient_slot"'
        )

    monkeypatch.setattr(appointments_db, "insert_appointment_auto", dup_auto)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "doctor_id": None,
            "reserved_at": _future_iso(10, 0),
        },
    )

    assert resp.status_code == 409
    assert (
        resp.json()["detail"]
        == "이 환자는 그 시간에 이미 다른 예약이 있어요. 다른 시간을 골라 주세요."
    )


def test_create_appointment_foreign_unique_violation_is_not_patient_409(monkeypatch):
    # 코드리뷰 High: 매핑이 제약 이름을 안 보면, deferred-work.md:127 이 예정한
    # (doctor_id, reserved_at) 부분 유니크가 들어오는 순간 **의사 충돌이 환자 문구**로 나간다.
    # 다른 제약 이름의 UniqueViolation 은 환자 409 로 삼키지 말고 그대로 올라가야 한다.
    from psycopg.errors import UniqueViolation

    class _NamedUniqueViolation(UniqueViolation):
        """diag 를 가진 UniqueViolation 테스트 더블 — 손제작 예외의 diag 는 원래 전부 None 이라
        (deferred-work.md:60 이 기록한 함정) 이름 분기를 검증하려면 diag 를 직접 얹어야 한다."""

        def __init__(self, constraint_name: str):
            super().__init__("duplicate key value violates unique constraint")
            self._constraint_name = constraint_name

        @property
        def diag(self):  # type: ignore[override]
            from types import SimpleNamespace

            return SimpleNamespace(constraint_name=self._constraint_name)

    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)

    def other_unique(*args, **kwargs):
        raise _NamedUniqueViolation("uq_appointment_doctor_slot")

    monkeypatch.setattr(appointments_db, "insert_appointment", other_unique)

    client = TestClient(app)
    with pytest.raises(UniqueViolation):
        client.post(
            "/appointments",
            json={
                "patient_id": 1,
                "hospital_department_id": 2,
                "doctor_id": 4,
                "reserved_at": _future_iso(10, 0),
            },
        )
