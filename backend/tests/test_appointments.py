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
