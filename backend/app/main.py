"""FastAPI 앱 진입점 — 앱 생성, CORS, 라우터 마운트, DB 풀 lifespan, 전역 오류 핸들러."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.pool import close_pool, init_pool
from app.routers import refdata

logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작: DB 커넥션 풀 오픈 / 종료: 풀 닫기.
    init_pool()
    yield
    close_pool()


app = FastAPI(title="hospital-care API", lifespan=lifespan)

# 브라우저 → FastAPI 직접 호출(AD-1). 로컬은 Next.js dev(3000), 배포는 Vercel 오리진(Story 1.2).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(refdata.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """미처리 예외(DB 다운·풀 타임아웃 등 인프라 오류)를 AD-10 계약 형태로 변환.

    실제 원인·스택 추적은 서버 로그에만 남기고, 클라이언트에는 한국어 일반 메시지만
    노출한다(UX-DR10: 정직하되 내부 기술 용어/스택 노출 금지). FastAPI 기본 500 은
    영문 평문 "Internal Server Error" 라 계약({"detail": ...})과 어긋나므로 여기서 통일한다.
    참고: HTTPException(4xx)·검증 오류(422)는 FastAPI 기본 핸들러가 먼저 처리하므로 여기 오지 않는다.
    """
    logger.error("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "일시적인 서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요."},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
