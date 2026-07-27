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

    def fake_select(doctor_id, start, end):
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
    assert set(data.keys()) == {"doctor_id", "taken"}
    assert data["doctor_id"] == 3
    assert len(data["taken"]) == 2
    # 슬롯은 ISO-8601 UTC 로 직렬화된다(프런트는 문자열 비교가 아니라 epoch ms 로 정규화해 매칭).
    assert all(isinstance(t, str) for t in data["taken"])
    assert captured["doctor_id"] == 3


def test_get_availability_empty_returns_empty_list(monkeypatch):
    monkeypatch.setattr(availability_db, "select_taken_slots", lambda *a: [])

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
    assert resp.json() == {"doctor_id": 3, "taken": []}


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

    def fake_select(doctor_id, start, end):
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
