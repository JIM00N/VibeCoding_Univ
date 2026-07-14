"""전역 예외 핸들러 계약 테스트 (Story 1.2 배포 하드닝).

DB 계층이 인프라 오류(예: 풀 타임아웃/DB 다운)로 예외를 던져도
클라이언트에는 AD-10 계약(HTTP 5xx + {"detail": 한국어})으로 응답해야 한다.
스택 추적/영문 기본 메시지("Internal Server Error")가 새지 않는지 검증한다.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import refdata as refdata_db
from app.main import app


def test_unhandled_infra_error_maps_to_korean_detail(monkeypatch):
    def boom():
        raise RuntimeError("simulated DB pool timeout")

    # 인프라 오류를 db 계층에서 시뮬레이션 — 서비스/라우터엔 try/except 가 없어
    # 예외가 전역 핸들러까지 전파된다.
    monkeypatch.setattr(refdata_db, "fetch_departments", boom)

    # raise_server_exceptions=False: 서버가 실제로 내보내는 응답을 검사(재-raise 억제).
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/departments")

    # AD-10: 오류는 HTTP 5xx + {"detail": 한국어 문자열}.
    assert resp.status_code == 500
    body = resp.json()
    assert isinstance(body.get("detail"), str)
    # 영문 기본 메시지가 아니라 한국어 계약 메시지여야 한다.
    assert body["detail"] != "Internal Server Error"
    assert body["detail"] == "일시적인 서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요."
    # 내부 예외 문구/스택 추적이 클라이언트로 새지 않아야 한다.
    assert "simulated DB pool timeout" not in body["detail"]
    assert "Traceback" not in body["detail"]


def test_500_response_carries_cors_headers_for_allowed_origin(monkeypatch):
    # 배포 교차오리진 시나리오: 브라우저가 500 의 한국어 {detail} 를 읽으려면 500 응답에도
    # access-control-allow-origin 이 있어야 한다. 핸들러가 CORSMiddleware 바깥이라 직접 부여함.
    def boom():
        raise RuntimeError("simulated DB down")

    monkeypatch.setattr(refdata_db, "fetch_departments", boom)

    client = TestClient(app, raise_server_exceptions=False)
    # 기본 허용 오리진(http://localhost:3000)으로 500 을 유발.
    resp = client.get("/departments", headers={"Origin": "http://localhost:3000"})

    assert resp.status_code == 500
    # 허용 오리진이면 500 에도 CORS 헤더가 붙어 브라우저가 응답을 차단하지 않는다.
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_500_response_no_cors_headers_for_disallowed_origin(monkeypatch):
    # 허용되지 않은 오리진에는 CORS 헤더를 부여하지 않는다(CORSMiddleware 와 동일 규칙).
    def boom():
        raise RuntimeError("simulated DB down")

    monkeypatch.setattr(refdata_db, "fetch_departments", boom)

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/departments", headers={"Origin": "https://evil.example.com"})

    assert resp.status_code == 500
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}


def test_http_exception_still_returns_detail_unchanged():
    # 전역 핸들러가 정상 HTTPException(4xx) 처리를 삼키지 않는지 확인.
    # 없는 경로 → FastAPI 기본 404 {"detail": "Not Found"} 가 그대로 나와야 한다.
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/does-not-exist")
    assert resp.status_code == 404
    assert resp.json().get("detail") == "Not Found"
