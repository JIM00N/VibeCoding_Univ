"""POST /medical-records 계약 테스트 (Story 3.1).

db 계층(appointments.fetch_appointment · medical_records.insert_medical_record_and_complete)을
가짜로 바꿔 라우터→서비스→스키마 매핑·가드 체인만 검증한다. 실제 DB 연결·시크릿 없이 돈다.
lifespan(풀 오픈)을 트리거하지 않도록 TestClient 를 context manager 없이 사용한다(기존 패턴).

핵심 계약:
- 확정 예약에만 기록 작성(그 외 4xx 한국어 {detail}) — AD-5 서비스 가드.
- 스냅샷 3필드(patient_id·hospital_department_id·doctor_id)는 클라이언트가 못 보낸다(extra=forbid)
  — SQL 이 예약 행에서 복사하므로 db 함수 인자에도 없다(AC3 계약).
- 예약당 기록 1건: UniqueViolation → 409(부분 유니크 인덱스가 원천, AC4).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app.db import appointments as appointments_db
from app.db import medical_records as medical_records_db
from app.main import app


def _fake_appointment(**over):
    """fetch_appointment 이 돌려주는 예약 행(표시 필드 포함) 모양."""
    row = {
        "id": 10,
        "patient_id": 1,
        "hospital_department_id": 2,
        "doctor_id": 3,
        "reserved_at": datetime(2026, 7, 24, 1, 30, tzinfo=timezone.utc),
        "status": "확정",
        "patient_name": "이수민",
        "doctor_name": "김민재",
        "department_name": "이비인후과",
    }
    row.update(over)
    return row


def _fake_record_row(**over):
    """insert_medical_record_and_complete 가 돌려주는 기록 행(표시 필드 포함) 모양."""
    row = {
        "id": 7,
        "appointment_id": 10,
        "patient_id": 1,
        "hospital_department_id": 2,
        "doctor_id": 3,
        "visited_at": datetime(2026, 7, 24, 1, 35, tzinfo=timezone.utc),
        "diagnosis": "급성 인두염",
        "notes": "수분 섭취 권장",
        "patient_name": "이수민",
        "doctor_name": "김민재",
        "department_name": "이비인후과",
        "prescriptions": [],
    }
    row.update(over)
    return row


def _fail(*args, **kwargs):
    raise AssertionError("이 db 함수는 호출되면 안 됩니다(서비스 검증에서 먼저 막힘).")


def _payload(**over):
    body = {
        "appointment_id": 10,
        "diagnosis": "급성 인두염",
        "notes": "수분 섭취 권장",
        "visited_at": "2026-07-24T01:35:00Z",
    }
    body.update(over)
    return body


# ── 성공 경로 (AC1·AC3) ──────────────────────────────────────────────


def test_create_record_returns_201_canonical_shape(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    # 시그니처 자체가 계약: 스냅샷 3필드(patient/hd/doctor)는 인자에 없다 — SQL 이 예약 행에서 복사(AC3).
    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["args"] = (appointment_id, visited_at, diagnosis, notes)
        return _fake_record_row(
            appointment_id=appointment_id, visited_at=visited_at,
            diagnosis=diagnosis, notes=notes,
        )

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 201
    data = resp.json()
    # AD-10: flat 정규 모델 — FK 정수 id + 평평한 표시 필드. nested 금지.
    assert set(data.keys()) == {
        "id",
        "appointment_id",
        "patient_id",
        "hospital_department_id",
        "doctor_id",
        "visited_at",
        "diagnosis",
        "notes",
        "patient_name",
        "doctor_name",
        "department_name",
        "prescriptions",
    }
    assert captured["args"] == (
        10,
        datetime(2026, 7, 24, 1, 35, tzinfo=timezone.utc),
        "급성 인두염",
        "수분 섭취 권장",
    )
    # 스냅샷 3필드는 db 행(=예약 행 복사) 값 그대로 응답에 실린다.
    assert data["patient_id"] == 1
    assert data["hospital_department_id"] == 2
    assert data["doctor_id"] == 3
    assert data["diagnosis"] == "급성 인두염"
    assert data["patient_name"] == "이수민"
    assert data["doctor_name"] == "김민재"
    assert data["department_name"] == "이비인후과"


def test_create_record_without_notes_passes_none(monkeypatch):
    # 소견은 선택 — 생략하면 db 에 None 으로 전달돼 null 저장된다(빈 문자열 저장 방지).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["notes"] = notes
        return _fake_record_row(appointment_id=appointment_id, notes=notes)

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    body = _payload()
    del body["notes"]
    resp = client.post("/medical-records", json=body)

    assert resp.status_code == 201
    assert captured["notes"] is None
    assert resp.json()["notes"] is None


def test_create_record_blank_notes_normalized_to_none(monkeypatch):
    # 프런트가 빈 문자열/공백 소견을 보내도 None 으로 정규화된다(patients 검증자 미러).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["notes"] = notes
        return _fake_record_row(appointment_id=appointment_id, notes=notes)

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload(notes="   "))

    assert resp.status_code == 201
    assert captured["notes"] is None


def test_create_record_naive_visited_at_normalized_to_utc(monkeypatch):
    # tz-naive visited_at 은 UTC 로 간주한다(slots.to_slot 동일 규약) — 세션 TimeZone 의존 제거.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["visited_at"] = visited_at
        return _fake_record_row(appointment_id=appointment_id, visited_at=visited_at)

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records", json=_payload(visited_at="2026-07-24T01:35:00")
    )

    assert resp.status_code == 201
    saved = captured["visited_at"]
    assert saved.tzinfo is not None
    assert saved == datetime(2026, 7, 24, 1, 35, tzinfo=timezone.utc)


# ── 도메인 가드 (AC2) — 거부 경로에서 쓰기 db 함수는 호출되지 않는다 ──


def test_create_record_blank_diagnosis_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload(diagnosis="   "))

    assert resp.status_code == 400
    assert "진단명" in resp.json()["detail"]


def test_create_record_unknown_appointment_returns_404(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_appointment", lambda aid: None)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload(appointment_id=999))

    assert resp.status_code == 404
    assert resp.json()["detail"] == "예약을 찾을 수 없어요."


def test_create_record_pending_appointment_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment",
        lambda aid: _fake_appointment(id=aid, status="대기"),
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert isinstance(detail, str)
    assert "확정" in detail


def test_create_record_cancelled_appointment_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment",
        lambda aid: _fake_appointment(id=aid, status="취소"),
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 400
    assert "취소된 예약" in resp.json()["detail"]


def test_create_record_completed_appointment_rejected(monkeypatch):
    monkeypatch.setattr(
        appointments_db, "fetch_appointment",
        lambda aid: _fake_appointment(id=aid, status="완료"),
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 400
    assert "완료" in resp.json()["detail"]


def test_create_record_null_doctor_rejected(monkeypatch):
    # P0 앱은 doctor_id 를 항상 채우지만(2.1), null 이면 NOT NULL 삽입 500 전에 앱이 먼저 거부(FR-9).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment",
        lambda aid: _fake_appointment(id=aid, doctor_id=None, doctor_name=None),
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 400
    assert "담당 의사" in resp.json()["detail"]


# ── 경합·중복 (AC1 CAS · AC4 부분 유니크) ────────────────────────────


def test_create_record_race_returns_409(monkeypatch):
    # 검증 시점엔 확정이었지만 INSERT 시점에 status 가 바뀐 경합 — CTE CAS 가 0행 → None → 409.
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    monkeypatch.setattr(
        medical_records_db,
        "insert_medical_record_and_complete",
        lambda *a, **k: None,
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 409
    assert resp.json()["detail"] == "예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요."


def test_create_record_duplicate_returns_409(monkeypatch):
    # 부분 유니크 인덱스(uq_medical_record_appointment) 위반 — 예약당 기록 1건(AC4).
    # 단일 CTE 문이라 완료 전이도 함께 롤백된다(기록 없이 완료되는 예약 없음).
    def raise_unique(*args, **kwargs):
        raise UniqueViolation()

    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", raise_unique
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 409
    assert "이미 진료 기록" in resp.json()["detail"]


# ── 스키마 계약 (422 — Pydantic) ─────────────────────────────────────


def test_create_record_missing_required_fields_returns_422(monkeypatch):
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    for missing in ("appointment_id", "diagnosis", "visited_at"):
        body = _payload()
        del body[missing]
        resp = client.post("/medical-records", json=body)
        assert resp.status_code == 422, f"{missing} 누락은 422 여야 합니다"


def test_create_record_rejects_snapshot_field_injection(monkeypatch):
    # AC3: 스냅샷 3필드는 서버(SQL)가 예약 행에서 복사한다 — 클라이언트 주입은 extra=forbid 로 422.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    for field in ("patient_id", "hospital_department_id", "doctor_id"):
        resp = client.post("/medical-records", json=_payload(**{field: 99}))
        assert resp.status_code == 422, f"{field} 주입은 422 여야 합니다"


# ── 처방 0..N (Story 3.2, AC2~AC4) ───────────────────────────────────


def test_create_record_with_prescriptions_returns_flat_list(monkeypatch):
    # 처방 2행 성공 — 서비스는 dict 리스트를 db 함수에 그대로 전달하고(단일 CTE 문이 한 번에 쓴다),
    # 응답 prescriptions 는 flat 키셋(id·drug_id·drug_name·dosage·days) 고정(AD-10, drug 객체 중첩 금지).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["prescriptions"] = prescriptions
        return _fake_record_row(
            prescriptions=[
                {"id": 1, "drug_id": 2, "drug_name": "아목시실린캡슐 250mg",
                 "dosage": "1일 3회 식후", "days": 3},
                {"id": 2, "drug_id": 3, "drug_name": "이부프로펜정 200mg",
                 "dosage": None, "days": None},
            ]
        )

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(
            prescriptions=[
                {"drug_id": 2, "dosage": "1일 3회 식후", "days": 3},
                {"drug_id": 3},
            ]
        ),
    )

    assert resp.status_code == 201
    # db 인자 계약: dict 리스트 그대로(생략 필드는 None 채움) — 스냅샷 3필드는 여전히 인자에 없다.
    assert captured["prescriptions"] == [
        {"drug_id": 2, "dosage": "1일 3회 식후", "days": 3},
        {"drug_id": 3, "dosage": None, "days": None},
    ]
    data = resp.json()
    assert len(data["prescriptions"]) == 2
    assert all(
        set(p.keys()) == {"id", "drug_id", "drug_name", "dosage", "days"}
        for p in data["prescriptions"]
    )
    assert data["prescriptions"][0]["drug_name"] == "아목시실린캡슐 250mg"
    assert data["prescriptions"][1]["dosage"] is None


def test_create_record_without_prescriptions_passes_empty_list(monkeypatch):
    # AC3: prescriptions 생략 → db 에 [] 전달, 응답 [] (3.1 동작 그대로).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["prescriptions"] = prescriptions
        return _fake_record_row()

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post("/medical-records", json=_payload())

    assert resp.status_code == 201
    assert captured["prescriptions"] == []
    assert resp.json()["prescriptions"] == []


def test_create_record_blank_dosage_normalized_to_none(monkeypatch):
    # 행 dosage 빈 문자열/공백 → None 정규화(notes 와 같은 검증자 공유 — 빈 문자열 저장 방지).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    captured: dict = {}

    def fake_insert(appointment_id, visited_at, diagnosis, notes, prescriptions):
        captured["prescriptions"] = prescriptions
        return _fake_record_row()

    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", fake_insert
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"drug_id": 1, "dosage": "   "}]),
    )

    assert resp.status_code == 201
    assert captured["prescriptions"][0]["dosage"] is None


def test_create_record_days_below_one_rejected(monkeypatch):
    # ④' 일수 가드 — DB days 엔 CHECK 없음, 앱이 규칙 소유(400 한국어, 쓰기 미호출).
    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"drug_id": 1, "days": 0}]),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "처방 일수는 1 이상의 숫자로 입력해 주세요."


def test_create_record_non_numeric_days_returns_422(monkeypatch):
    # days 는 int — 숫자 아닌 값은 Pydantic 이 422 로 거부(쓰기 미호출).
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"drug_id": 1, "days": "삼일"}]),
    )

    assert resp.status_code == 422


def test_create_record_prescription_missing_drug_id_returns_422(monkeypatch):
    # 행의 약은 유일한 필수 필드 — drug_id 누락은 422.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"dosage": "1일 3회", "days": 3}]),
    )

    assert resp.status_code == 422


def test_create_record_prescription_extra_field_returns_422(monkeypatch):
    # 행 여분 필드(drug_name 등 서버 표시 필드) 주입은 extra=forbid 로 422 — 스냅샷 주입 거부 미러.
    monkeypatch.setattr(appointments_db, "fetch_appointment", _fail)
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", _fail
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"drug_id": 1, "drug_name": "타이레놀정 500mg"}]),
    )

    assert resp.status_code == 422


def test_create_record_unknown_drug_returns_400(monkeypatch):
    # ⑤' FK 위반(없는 drug_id) → 400 한국어. 단일 문장이라 기록·완료 전이·다른 처방도 함께 롤백된다.
    from psycopg.errors import ForeignKeyViolation

    def raise_fk(*args, **kwargs):
        raise ForeignKeyViolation()

    monkeypatch.setattr(
        appointments_db, "fetch_appointment", lambda aid: _fake_appointment(id=aid)
    )
    monkeypatch.setattr(
        medical_records_db, "insert_medical_record_and_complete", raise_fk
    )

    client = TestClient(app)
    resp = client.post(
        "/medical-records",
        json=_payload(prescriptions=[{"drug_id": 999}]),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "선택한 약을 찾을 수 없어요. 약을 다시 선택해 주세요."
