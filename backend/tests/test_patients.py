"""POST·GET /patients 계약 테스트.

db 계층(insert_patient·fetch_patients)을 가짜로 바꿔 라우터→서비스→스키마 매핑·검증만 검증한다.
실제 DB 연결·시크릿 없이 돈다. lifespan(풀 오픈)을 트리거하지 않도록
TestClient 를 context manager 없이 사용한다(test_refdata 패턴).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import patients as patients_db
from app.main import app


def test_create_patient_returns_flat_canonical_shape(monkeypatch):
    def fake_insert(name, birth_date, gender, phone):
        return {
            "id": 4,
            "name": name,
            "birth_date": birth_date,
            "gender": gender,
            "phone": phone,
        }

    monkeypatch.setattr(patients_db, "insert_patient", fake_insert)

    client = TestClient(app)
    resp = client.post(
        "/patients",
        json={
            "name": "홍길동",
            "birth_date": "1990-05-01",
            "gender": "M",
            "phone": "010-1234-5678",
        },
    )

    assert resp.status_code == 201
    data = resp.json()
    # AD-10: flat 정규 모델 — 정수 id + 평평한 표시 필드. nested 금지.
    assert data == {
        "id": 4,
        "name": "홍길동",
        "birth_date": "1990-05-01",
        "gender": "M",
        "phone": "010-1234-5678",
    }
    assert isinstance(data["id"], int)
    assert set(data.keys()) == {"id", "name", "birth_date", "gender", "phone"}


def test_create_patient_name_only_optional_fields_null(monkeypatch):
    def fake_insert(name, birth_date, gender, phone):
        return {
            "id": 5,
            "name": name,
            "birth_date": birth_date,
            "gender": gender,
            "phone": phone,
        }

    monkeypatch.setattr(patients_db, "insert_patient", fake_insert)

    client = TestClient(app)
    resp = client.post("/patients", json={"name": "김철수"})

    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == 5
    assert data["name"] == "김철수"
    assert data["birth_date"] is None
    assert data["gender"] is None
    assert data["phone"] is None


def test_create_patient_blank_name_rejected_korean_detail(monkeypatch):
    # db 는 호출되면 안 됨(서비스 검증에서 먼저 막힘).
    def fail_insert(*args, **kwargs):
        raise AssertionError("insert_patient 가 호출되면 안 됩니다(이름 검증 실패 시).")

    monkeypatch.setattr(patients_db, "insert_patient", fail_insert)

    client = TestClient(app)
    resp = client.post("/patients", json={"name": "   "})

    assert resp.status_code == 400
    body = resp.json()
    # detail 은 문자열(한국어) — lib/api.ts 가 그대로 표시(AD-10).
    assert isinstance(body["detail"], str)
    assert body["detail"] == "이름을 입력해 주세요."


def test_create_patient_missing_name_returns_422():
    client = TestClient(app)
    resp = client.post("/patients", json={})
    # name 필드 누락 → Pydantic 필수 필드 검증(422). 클라이언트는 제출 전 인라인으로 먼저 막음.
    assert resp.status_code == 422


def test_create_patient_invalid_gender_rejected_korean_detail(monkeypatch):
    # 성별 도메인은 M/F/null 만 허용 — 그 외 값은 서버가 400 한국어로 막는다(UI 우회 호출 방어).
    def fail_insert(*args, **kwargs):
        raise AssertionError("insert_patient 가 호출되면 안 됩니다(성별 검증 실패 시).")

    monkeypatch.setattr(patients_db, "insert_patient", fail_insert)

    client = TestClient(app)
    for bad in ("남", "male", "X", "1"):
        resp = client.post("/patients", json={"name": "홍길동", "gender": bad})
        assert resp.status_code == 400, f"gender={bad!r} 이 거부되지 않음"
        body = resp.json()
        assert isinstance(body["detail"], str)
        assert body["detail"] == "성별 값이 올바르지 않아요."


def test_create_patient_valid_genders_accepted(monkeypatch):
    def fake_insert(name, birth_date, gender, phone):
        return {"id": 7, "name": name, "birth_date": birth_date, "gender": gender, "phone": phone}

    monkeypatch.setattr(patients_db, "insert_patient", fake_insert)

    client = TestClient(app)
    for good in ("M", "F"):
        resp = client.post("/patients", json={"name": "홍길동", "gender": good})
        assert resp.status_code == 201, f"gender={good!r} 이 거부됨"
        assert resp.json()["gender"] == good


def test_create_patient_empty_optional_strings_coerced_to_none(monkeypatch):
    captured: dict = {}

    def fake_insert(name, birth_date, gender, phone):
        captured.update(name=name, birth_date=birth_date, gender=gender, phone=phone)
        return {
            "id": 6,
            "name": name,
            "birth_date": birth_date,
            "gender": gender,
            "phone": phone,
        }

    monkeypatch.setattr(patients_db, "insert_patient", fake_insert)

    client = TestClient(app)
    resp = client.post(
        "/patients",
        json={"name": "이영희", "gender": "", "phone": "  ", "birth_date": ""},
    )

    assert resp.status_code == 201
    # 빈 문자열/공백 선택 필드는 None 으로 정규화되어 db 에 전달(빈 문자열 저장 방지).
    assert captured["gender"] is None
    assert captured["phone"] is None
    assert captured["birth_date"] is None


# ── GET /patients (목록·이름 검색, Story 1.4) ────────────────────────────────
# fetch_patients 를 가짜로 바꿔 라우터→서비스→PatientOut 매핑·검색어 정규화만 검증한다.


def test_get_patients_returns_flat_canonical_list_shape(monkeypatch):
    fake_rows = [
        {"id": 1, "name": "이수민", "birth_date": "1992-03-14", "gender": "F", "phone": "010-1111-2222"},
        {"id": 2, "name": "박지훈", "birth_date": "1985-11-02", "gender": "M", "phone": "010-3333-4444"},
    ]
    monkeypatch.setattr(patients_db, "fetch_patients", lambda search: fake_rows)

    client = TestClient(app)
    resp = client.get("/patients")

    assert resp.status_code == 200
    data = resp.json()
    # AD-10: POST 와 동일한 flat 정규 모델(리소스당 모델 1개). nested 금지.
    assert data == fake_rows
    assert all(isinstance(p["id"], int) for p in data)
    assert all(
        set(p.keys()) == {"id", "name", "birth_date", "gender", "phone"} for p in data
    )


def test_get_patients_empty_list(monkeypatch):
    monkeypatch.setattr(patients_db, "fetch_patients", lambda search: [])
    client = TestClient(app)
    resp = client.get("/patients")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_patients_search_term_passed_to_db(monkeypatch):
    captured: dict = {}

    def fake_fetch(search):
        captured["search"] = search
        return [
            {"id": 3, "name": "최유진", "birth_date": "2000-07-21", "gender": "F", "phone": "010-5555-6666"},
        ]

    monkeypatch.setattr(patients_db, "fetch_patients", fake_fetch)

    client = TestClient(app)
    resp = client.get("/patients", params={"search": "유진"})

    assert resp.status_code == 200
    # 검색어가 db 계층까지 그대로 전달돼 서버측 필터가 수행된다(AC2, 클라이언트 필터 아님).
    assert captured["search"] == "유진"
    assert resp.json()[0]["name"] == "최유진"


def test_escape_like_neutralizes_wildcards():
    # LIKE 메타문자를 리터럴화해야 '%' 검색이 전체 매칭되는 오검색을 막는다(코드 리뷰 패치).
    from app.db.patients import _escape_like

    assert _escape_like("%") == "\\%"
    assert _escape_like("_") == "\\_"
    assert _escape_like("\\") == "\\\\"
    # 백슬래시를 먼저 처리해 이중 이스케이프가 안 나야 한다.
    assert _escape_like("김_수%") == "김\\_수\\%"
    # 평범한 한글 이름은 그대로.
    assert _escape_like("홍길동") == "홍길동"


def test_get_patients_blank_search_normalized_to_none(monkeypatch):
    captured: dict = {}

    def fake_fetch(search):
        captured["search"] = search
        return []

    monkeypatch.setattr(patients_db, "fetch_patients", fake_fetch)

    client = TestClient(app)
    # 공백만 있는 검색어는 서비스가 None 으로 정규화 → db 는 전체 목록으로 취급.
    resp = client.get("/patients", params={"search": "   "})

    assert resp.status_code == 200
    assert captured["search"] is None
