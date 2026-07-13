"""애플리케이션 설정. 환경변수만 읽는다(시크릿은 코드/번들에 넣지 않음, AD-7)."""
from __future__ import annotations

import os

from dotenv import load_dotenv

# 로컬 개발용 backend/.env 로드(배포 환경은 실제 환경변수가 이미 주입됨).
load_dotenv()


class Settings:
    # Supabase Postgres 연결 문자열(서버 전용).
    database_url: str = os.environ.get("DATABASE_URL", "")

    # CORS 허용 오리진(쉼표 구분). 기본은 로컬 Next.js dev 서버.
    # 빈 문자열/공백만 있는 값도 "미설정"으로 취급해 기본값을 쓴다(실수로 전 오리진 차단 방지).
    _cors_raw: str = os.environ.get("CORS_ORIGINS", "") or ""
    cors_origins: list[str] = [
        o.strip()
        for o in (_cors_raw if _cors_raw.strip() else "http://localhost:3000").split(",")
        if o.strip()
    ]

    # 동적 서브도메인(예: Vercel 프리뷰)을 정규식으로 허용할 때(Story 1.2). 없으면 None.
    cors_origin_regex: str | None = os.environ.get("CORS_ORIGIN_REGEX") or None


settings = Settings()
