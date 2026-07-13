"""FastAPI 앱 진입점 — 앱 생성, CORS, 라우터 마운트, DB 풀 lifespan."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.pool import close_pool, init_pool
from app.routers import refdata


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
