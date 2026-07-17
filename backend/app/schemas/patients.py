"""환자 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, field_validator


class PatientCreate(BaseModel):
    """환자 등록 요청. name 만 필수(스키마 NOT NULL), 나머지는 선택(nullable).

    이름의 공백 검증·거부는 서비스 계층이 소유한다(친절한 한국어 {detail} 를 위해 —
    Pydantic 422 는 리스트 detail 이라 lib/api.ts 가 일반 메시지로 바꾼다, AD-10).
    """

    name: str
    birth_date: date | None = None
    gender: str | None = None
    phone: str | None = None

    @field_validator("gender", "phone", mode="before")
    @classmethod
    def _blank_str_to_none(cls, v: object) -> object:
        # 프런트가 빈 문자열/공백을 보내도 DB 엔 null 로 저장(빈 문자열 저장 방지).
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("birth_date", mode="before")
    @classmethod
    def _blank_date_to_none(cls, v: object) -> object:
        # 빈 생년월일("")은 date 파싱 실패(422) 대신 None 으로(선택 필드).
        if isinstance(v, str) and not v.strip():
            return None
        return v


class PatientOut(BaseModel):
    """환자 정규 응답. 정수 id + 평평한 표시 필드(nested 금지, AD-10).

    birth_date 는 ISO 날짜("YYYY-MM-DD")로 직렬화된다.
    """

    id: int
    name: str
    birth_date: date | None = None
    gender: str | None = None
    phone: str | None = None
