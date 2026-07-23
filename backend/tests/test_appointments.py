"""POST /appointments 계약 테스트 (Story 2.1).

db 계층(fetch_doctor_department·insert_appointment)을 가짜로 바꿔 라우터→서비스→스키마
매핑·검증·슬롯 floor 만 검증한다. 실제 DB 연결·시크릿 없이 돈다.
lifespan(풀 오픈)을 트리거하지 않도록 TestClient 를 context manager 없이 사용한다(test_patients 패턴).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import appointments as appointments_db
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
            "reserved_at": "2026-07-20T01:30:00Z",
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
            "reserved_at": "2026-07-20T10:17:42Z",
        },
    )

    assert resp.status_code == 201
    saved = captured["reserved_at"]
    # 분 ∈ {0,30}, 초 = 0 (appointment_reserved_at_slot_check 통과 조건).
    assert saved.minute in (0, 30)
    assert saved.second == 0
    assert saved == datetime(2026, 7, 20, 10, 0, 0, tzinfo=timezone.utc)


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
            "reserved_at": "2026-07-20T14:30:00Z",
        },
    )

    assert resp.status_code == 201
    assert captured["reserved_at"] == datetime(2026, 7, 20, 14, 30, 0, tzinfo=timezone.utc)


def test_create_appointment_missing_doctor_rejected_korean_detail(monkeypatch):
    # AC3: 담당 의사 미선택 → 400 한국어. db 는 (fetch·insert 모두) 호출되면 안 된다.
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "insert_appointment", _fail)

    client = TestClient(app)
    resp = client.post(
        "/appointments",
        json={
            "patient_id": 1,
            "hospital_department_id": 2,
            "reserved_at": "2026-07-20T10:00:00Z",
        },
    )

    assert resp.status_code == 400
    body = resp.json()
    assert isinstance(body["detail"], str)
    assert body["detail"] == "담당 의사를 선택해 주세요."


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
            "reserved_at": "2026-07-20T10:00:00Z",
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
            "reserved_at": "2026-07-20T10:00:00Z",
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
            "reserved_at": "2026-07-20T10:00:00Z",
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
            "reserved_at": "2026-07-20T10:00:00Z",
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
            "reserved_at": "2026-07-20T10:00:00Z",
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


# --- Story 2.3: PATCH /appointments/{id}/doctor (담당 의사 변경) ----------------


def test_change_doctor_on_pending_appointment(monkeypatch):
    # AC1/AC3: 대기 예약의 담당 의사 변경 — doctor_id 만 갱신, status 불변, 정규 모델 반환.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    captured: dict = {}

    def fake_update(appointment_id, doctor_id, allowed_sources):
        captured["args"] = (appointment_id, doctor_id)
        captured["allowed"] = allowed_sources
        return _fake_row(
            id=appointment_id, status="대기", doctor_id=doctor_id, doctor_name="박서연"
        )

    monkeypatch.setattr(appointments_db, "update_appointment_doctor", fake_update)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 200
    assert captured["args"] == (10, 4)
    # compare-and-set: 대기·확정에서만 변경 허용 → UPDATE 에 그 출발 status 들이 전달된다.
    assert "대기" in captured["allowed"] and "확정" in captured["allowed"]
    data = resp.json()
    # 응답에 새 doctor_id 와 doctor_name 이 함께 와야 색 배지(2.4)가 정합된다.
    assert data["doctor_id"] == 4
    assert data["doctor_name"] == "박서연"
    # status·진료과는 불변(AD-5, 과 이동 없음).
    assert data["status"] == "대기"
    assert data["hospital_department_id"] == 2


def test_change_doctor_on_confirmed_appointment(monkeypatch):
    # AC1: 확정 예약도 담당 의사 변경 가능(대기·확정만).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="확정")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(
        appointments_db,
        "update_appointment_doctor",
        lambda aid, did, srcs: _fake_row(
            id=aid, status="확정", doctor_id=did, doctor_name="박서연"
        ),
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 200
    data = resp.json()
    assert data["doctor_id"] == 4
    assert data["status"] == "확정"


def test_change_doctor_unknown_appointment_returns_404(monkeypatch):
    # 없는 예약 → fetch_appointment None → 404. 의사 조회·update 호출 금지.
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: None)
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/999/doctor", json={"doctor_id": 4})

    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)


def test_change_doctor_completed_rejected(monkeypatch):
    # AC3: 완료 예약은 담당 의사 변경 불가 → 400. 의사 조회·update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="완료")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 400
    assert "완료" in resp.json()["detail"]


def test_change_doctor_cancelled_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="취소")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", _fail)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 400
    assert "취소" in resp.json()["detail"]


def test_change_doctor_unknown_doctor_rejected(monkeypatch):
    # 없는 의사 → fetch_doctor_department None → 400(2.1 문구 재사용). update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: None)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 999})

    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_change_doctor_wrong_department_rejected(monkeypatch):
    # 다른 진료과 의사(소속 1 ≠ 예약 진료과 2) → 400 "진료과"(2.1 문구 재사용). update 호출 금지.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 1)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 5})

    assert resp.status_code == 400
    assert "진료과" in resp.json()["detail"]


def test_change_doctor_same_doctor_rejected(monkeypatch):
    # 현재 담당 의사(3)와 같은 의사로 변경 시도 → 400 "다른 의사". update 호출 금지.
    monkeypatch.setattr(
        appointments_db,
        "fetch_appointment",
        lambda aid: _fake_row(id=aid, status="대기", doctor_id=3),
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(appointments_db, "update_appointment_doctor", _fail)

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 3})

    assert resp.status_code == 400
    assert "다른 의사" in resp.json()["detail"]


def test_change_doctor_race_returns_409(monkeypatch):
    # 경합: fetch 시점엔 대기지만 CAS UPDATE 가 0행(None) — 그 사이 완료/취소로 바뀜 → 409.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_row(id=aid, status="대기")
    )
    monkeypatch.setattr(appointments_db, "fetch_doctor_department", lambda doctor_id: 2)
    monkeypatch.setattr(
        appointments_db, "update_appointment_doctor", lambda aid, did, srcs: None
    )

    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={"doctor_id": 4})

    assert resp.status_code == 409
    assert isinstance(resp.json()["detail"], str)


def test_change_doctor_missing_doctor_id_returns_422():
    # doctor_id 누락 → Pydantic 필수 검증(422, 2.2 의 status 누락과 동일 계약).
    client = TestClient(app)
    resp = client.patch("/appointments/10/doctor", json={})
    assert resp.status_code == 422
