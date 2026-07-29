"""GET /availability 계약 테스트 (Story 5.1, FR-15).

db 계층(select_taken_slots)을 가짜로 바꿔 라우터→서비스→AvailabilityOut 매핑·파라미터
전달만 검증한다. 실 SQL(floor 식·union·게이트)은 monkeypatch 가 대체하므로 여기서 못
잡는다 — 실 보증은 curl 실증이 담당(스토리 Task 6, workflow 검증 규율).
lifespan(풀 오픈)을 트리거하지 않도록 TestClient 를 context manager 없이 사용한다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db import availability as availability_db
from app.main import app


def test_get_availability_returns_taken_slots(monkeypatch):
    # 점유 슬롯 2개를 돌려주는 가짜 db — 응답은 {doctor_id, taken} 정규 모양(AD-10) 하나뿐.
    taken = [
        datetime(2026, 8, 1, 0, 30, tzinfo=timezone.utc),
        datetime(2026, 8, 1, 2, 0, tzinfo=timezone.utc),
    ]
    captured: dict = {}

    def fake_select(doctor_id, start, end, exclude_appointment_id):
        captured["doctor_id"] = doctor_id
        return taken

    monkeypatch.setattr(availability_db, "select_taken_slots", fake_select)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    # patient_taken 은 환자 축(FR-15b) — patient_id 미지정이라 빈 배열이지만 키는 항상 있다.
    assert set(data.keys()) == {"doctor_id", "taken", "patient_taken"}
    assert data["patient_taken"] == []
    assert data["doctor_id"] == 3
    assert len(data["taken"]) == 2
    # 슬롯은 ISO-8601 UTC 로 직렬화된다(프런트는 문자열 비교가 아니라 epoch ms 로 정규화해 매칭).
    assert all(isinstance(t, str) for t in data["taken"])
    assert captured["doctor_id"] == 3


def test_get_availability_empty_returns_empty_list(monkeypatch):
    monkeypatch.setattr(
        availability_db,
        "select_taken_slots",
        lambda doctor_id, start, end, exclude_appointment_id: [],
    )

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"doctor_id": 3, "taken": [], "patient_taken": []}


def test_get_availability_requires_all_params():
    # doctor_id·start·end 는 전부 필수 — 누락은 FastAPI 422(프런트는 항상 셋 다 보낸다).
    client = TestClient(app)
    assert client.get("/availability").status_code == 422
    assert client.get("/availability", params={"doctor_id": 3}).status_code == 422
    assert (
        client.get(
            "/availability", params={"doctor_id": 3, "start": "2026-08-01T00:00:00Z"}
        ).status_code
        == 422
    )


def test_get_availability_normalizes_naive_datetimes_to_utc(monkeypatch):
    # tz-naive 입력은 UTC 로 간주(to_slot 과 같은 규약) — db 에는 항상 tz-aware UTC 가 전달된다.
    captured: dict = {}

    def fake_select(doctor_id, start, end, exclude_appointment_id):
        captured["start"] = start
        captured["end"] = end
        return []

    monkeypatch.setattr(availability_db, "select_taken_slots", fake_select)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "start": "2026-08-01T00:00:00",
            "end": "2026-08-02T00:00:00",
        },
    )

    assert resp.status_code == 200
    assert captured["start"] == datetime(2026, 8, 1, tzinfo=timezone.utc)
    assert captured["end"] == datetime(2026, 8, 2, tzinfo=timezone.utc)
    assert captured["start"].tzinfo is not None


# --- FR-15b(2026-07-28 chore): 환자 축 사전 표시 -----------------------------------
# 006 부분 유니크 인덱스가 만든 새 거부 클래스는 의사 축 조회로는 보이지 않는다 —
# patient_id 를 주면 그 환자가 이미 잡은 활성 슬롯을 함께 돌려줘 슬롯 피커가 제출 전에 막는다.


def test_get_availability_includes_patient_taken(monkeypatch):
    # 의사 축·환자 축을 각각 다른 db 함수가 채우고, 응답에 둘 다 실린다.
    doctor_taken = [datetime(2026, 8, 1, 0, 30, tzinfo=timezone.utc)]
    patient_taken = [datetime(2026, 8, 1, 3, 0, tzinfo=timezone.utc)]
    captured: dict = {}

    monkeypatch.setattr(
        availability_db,
        "select_taken_slots",
        lambda doctor_id, start, end, exclude_appointment_id: doctor_taken,
    )

    def fake_patient_select(patient_id, start, end, exclude_appointment_id):
        captured["patient_id"] = patient_id
        return patient_taken

    monkeypatch.setattr(availability_db, "select_patient_taken_slots", fake_patient_select)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "patient_id": 2,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert captured["patient_id"] == 2
    # 두 축은 섞이지 않는다 — taken 의 기존 의미(그 의사가 찼다)를 보존해야 기존 소비자가 회귀 없다.
    assert len(data["taken"]) == 1
    assert len(data["patient_taken"]) == 1
    assert data["patient_taken"][0].startswith("2026-08-01T03:00")


def test_get_availability_without_patient_id_skips_patient_query(monkeypatch):
    # patient_id 가 없으면 환자 축 조회를 아예 하지 않는다(불필요한 왕복 금지 + 기존 계약 보존).
    monkeypatch.setattr(
        availability_db,
        "select_taken_slots",
        lambda doctor_id, start, end, exclude_appointment_id: [],
    )

    def _fail(*args, **kwargs):
        raise AssertionError("patient_id 가 없으면 환자 축 db 를 건드리면 안 돼요.")

    monkeypatch.setattr(availability_db, "select_patient_taken_slots", _fail)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    assert resp.json()["patient_taken"] == []


# --- Story 7.1 (FR-19): 자기 행 제외 ------------------------------------------------
# 일정 변경 다이얼로그는 **그 예약 자신**의 슬롯을 taken 으로 그리면 안 된다 — 서버는
# exclude_appointment_id 로 허용하는데 화면만 막으면 "시각 유지 + 의사만 변경"이 UI 에서
# 불가능해진다(스토리 AC7). 두 축 **모두** 제외해야 한다: 환자 축(006 인덱스와 같은 판정
# 범위)에도 자기 예약이 들어 있어 하나만 고치면 여전히 막힌다.


def test_get_availability_threads_exclude_to_both_axes(monkeypatch):
    captured: dict = {}

    def fake_doctor_select(doctor_id, start, end, exclude_appointment_id):
        captured["doctor_axis"] = exclude_appointment_id
        return []

    def fake_patient_select(patient_id, start, end, exclude_appointment_id):
        captured["patient_axis"] = exclude_appointment_id
        return []

    monkeypatch.setattr(availability_db, "select_taken_slots", fake_doctor_select)
    monkeypatch.setattr(availability_db, "select_patient_taken_slots", fake_patient_select)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "patient_id": 2,
            "exclude_appointment_id": 10,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    assert captured["doctor_axis"] == 10
    assert captured["patient_axis"] == 10


def test_get_availability_exclude_defaults_to_none(monkeypatch):
    # 미지정이면 None 이 전달돼 기존 판정과 동일하다 — 기존 호출자(환자 예약·대리 예약)는
    # 이 파라미터를 보내지 않으므로 응답이 회귀 없이 같아야 한다.
    captured: dict = {}

    def fake_doctor_select(doctor_id, start, end, exclude_appointment_id):
        captured["doctor_axis"] = exclude_appointment_id
        return []

    def fake_patient_select(patient_id, start, end, exclude_appointment_id):
        captured["patient_axis"] = exclude_appointment_id
        return []

    monkeypatch.setattr(availability_db, "select_taken_slots", fake_doctor_select)
    monkeypatch.setattr(availability_db, "select_patient_taken_slots", fake_patient_select)

    client = TestClient(app)
    resp = client.get(
        "/availability",
        params={
            "doctor_id": 3,
            "patient_id": 2,
            "start": "2026-08-01T00:00:00Z",
            "end": "2026-08-02T00:00:00Z",
        },
    )

    assert resp.status_code == 200
    assert captured["doctor_axis"] is None
    assert captured["patient_axis"] is None
