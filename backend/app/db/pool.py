"""DB 커넥션 풀 — DB 커넥션을 여는 유일한 지점 (AD-2).

routers/services 는 여기서 커넥션을 얻어 쓰기만 하고, 직접 커넥션을 열지 않는다.
`prepare_threshold=None` 을 항상 설정해 Supabase transaction-mode 풀러(6543)에서
psycopg3 자동 prepared statement 가 내는 간헐 오류를 방어한다(운영 봉투).
"""
from __future__ import annotations

from psycopg_pool import ConnectionPool

from app.config import settings

_pool: ConnectionPool | None = None


def init_pool() -> None:
    """앱 시작 시 1회 호출. DATABASE_URL 로 커넥션 풀을 연다."""
    global _pool
    if _pool is not None:
        return
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL 이 설정되지 않았습니다. backend/.env 에 값을 넣으세요(.env.example 참고)."
        )
    _pool = ConnectionPool(
        conninfo=settings.database_url,
        kwargs={"prepare_threshold": None},
        min_size=1,
        max_size=5,
        open=False,
    )
    # 시작 시 실제 커넥션을 확보해 본다 — DATABASE_URL 이 틀리면 첫 요청 때 500 이 아니라
    # 여기서 바로 실패해 배포/기동 단계에서 문제를 드러낸다.
    _pool.open(wait=True, timeout=10.0)


def close_pool() -> None:
    """앱 종료 시 호출."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("DB 풀이 초기화되지 않았습니다. 시작 시 init_pool() 을 호출하세요.")
    return _pool
