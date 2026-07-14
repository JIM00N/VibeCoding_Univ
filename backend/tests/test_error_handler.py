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
    # 내부 예외 문구/스택 추적이 클라이언트로 새지 않아야 한다.
    assert "simulated DB pool timeout" not in body["detail"]
    assert "Traceback" not in body["detail"]


def test_http_exception_still_returns_detail_unchanged():
    # 전역 핸들러가 정상 HTTPException(4xx) 처리를 삼키지 않는지 확인.
    # 없는 경로 → FastAPI 기본 404 {"detail": "Not Found"} 가 그대로 나와야 한다.
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/does-not-exist")
    assert resp.status_code == 404
    assert resp.json().get("detail") == "Not Found"
