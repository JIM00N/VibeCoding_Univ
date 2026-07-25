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


# ── GET /doctors (진료과별 의사 목록, Story 2.1) ──────────────────────────────
# fetch_doctors 를 가짜로 바꿔 라우터→서비스→DoctorOut 매핑·필터 전달만 검증한다.


def test_get_doctors_filtered_by_department(monkeypatch):
    captured: dict = {}

    def fake_fetch(hospital_department_id):
        captured["hd"] = hospital_department_id
        return [
            {"id": 3, "name": "김민재", "hospital_department_id": 2, "department_name": "이비인후과"},
            {"id": 4, "name": "박서연", "hospital_department_id": 2, "department_name": "이비인후과"},
        ]

    monkeypatch.setattr(refdata_db, "fetch_doctors", fake_fetch)

    client = TestClient(app)
    resp = client.get("/doctors", params={"hospital_department_id": 2})

    assert resp.status_code == 200
    data = resp.json()
    # 필터값이 db 계층까지 그대로 전달돼 서버측 필터가 수행된다.
    assert captured["hd"] == 2
    # AD-10: flat 정규 모델 — 정수 id/FK + 평평한 표시 필드. nested 금지.
    assert all(
        set(d.keys()) == {"id", "name", "hospital_department_id", "department_name"} for d in data
    )
    assert all(isinstance(d["id"], int) and isinstance(d["hospital_department_id"], int) for d in data)
    assert data[0]["name"] == "김민재"


def test_get_doctors_no_filter_passes_none(monkeypatch):
    captured: dict = {}

    def fake_fetch(hospital_department_id):
        captured["hd"] = hospital_department_id
        return []

    monkeypatch.setattr(refdata_db, "fetch_doctors", fake_fetch)

    client = TestClient(app)
    resp = client.get("/doctors")

    assert resp.status_code == 200
    # 필터 없으면 None → db 는 전체 목록으로 취급.
    assert captured["hd"] is None


def test_get_doctors_empty(monkeypatch):
    monkeypatch.setattr(refdata_db, "fetch_doctors", lambda hospital_department_id: [])
    client = TestClient(app)
    resp = client.get("/doctors", params={"hospital_department_id": 99})
    assert resp.status_code == 200
    assert resp.json() == []


# ── GET /drugs (약 목록, Story 3.2) ──────────────────────────────────────────
# fetch_drugs 를 가짜로 바꿔 라우터→서비스→DrugOut 매핑만 검증한다(departments 미러).


def test_get_drugs_returns_flat_shape(monkeypatch):
    # drug 테이블 실측 모양: id 정수 + name 문자열 + unit(문자열 또는 null, FR 미사용 선택 필드).
    fake_rows = [
        {"id": 1, "name": "타이레놀정 500mg", "unit": "정"},
        {"id": 2, "name": "아목시실린캡슐 250mg", "unit": "캡슐"},
        {"id": 3, "name": "세티리진정 10mg", "unit": None},
    ]
    monkeypatch.setattr(refdata_db, "fetch_drugs", lambda: fake_rows)

    client = TestClient(app)
    resp = client.get("/drugs")

    assert resp.status_code == 200
    data = resp.json()
    assert data == fake_rows
    # AD-10: flat 모양 — id 는 정수, name 은 문자열. nested 객체 금지, 키셋 고정.
    assert all(isinstance(d["id"], int) and isinstance(d["name"], str) for d in data)
    assert all(set(d.keys()) == {"id", "name", "unit"} for d in data)


def test_get_drugs_empty(monkeypatch):
    monkeypatch.setattr(refdata_db, "fetch_drugs", lambda: [])
    client = TestClient(app)
    resp = client.get("/drugs")
    assert resp.status_code == 200
    assert resp.json() == []
