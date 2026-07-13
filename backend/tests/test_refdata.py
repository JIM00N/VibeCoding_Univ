"""GET /departments 계약 테스트.

db 계층(fetch_departments)을 가짜로 바꿔 라우터→서비스→스키마 매핑만 검증한다.
실제 DB 연결·시크릿 없이 돈다. lifespan(풀 오픈)을 트리거하지 않도록
TestClient 를 context manager 없이 사용한다.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import refdata as refdata_db
from app.main import app


def test_get_departments_returns_flat_int_id_shape(monkeypatch):
    # hospital_department.id(정수) + department.name(문자열) 모양을 가정.
    fake_rows = [
        {"id": 1, "name": "내과"},
        {"id": 2, "name": "이비인후과"},
        {"id": 3, "name": "정형외과"},
    ]
    monkeypatch.setattr(refdata_db, "fetch_departments", lambda: fake_rows)

    client = TestClient(app)
    resp = client.get("/departments")

    assert resp.status_code == 200
    data = resp.json()
    assert data == fake_rows
    # AD-10: flat 모양 — id 는 정수, name 은 문자열. nested 객체 금지.
    assert all(isinstance(d["id"], int) and isinstance(d["name"], str) for d in data)
    assert all(set(d.keys()) == {"id", "name"} for d in data)


def test_get_departments_empty(monkeypatch):
    monkeypatch.setattr(refdata_db, "fetch_departments", lambda: [])
    client = TestClient(app)
    resp = client.get("/departments")
    assert resp.status_code == 200
    assert resp.json() == []
