"""환자 비즈니스 규칙 계층 (AD-2). 검증·매핑을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from fastapi import HTTPException

from app.db import patients as patients_db
from app.schemas.patients import PatientCreate, PatientOut

# 성별 도메인은 'M'/'F'/null 로 확정(시드 일관). 프런트는 주민등록번호 앞자리에서 파생해 보내지만,
# 공개 엔드포인트라 UI 를 우회한 호출도 있을 수 있어 서버가 최종 관문으로 도메인을 강제한다(AD-10 도메인 거부).
_ALLOWED_GENDERS = ("M", "F")


def create_patient(payload: PatientCreate) -> PatientOut:
    """신규 환자를 생성한다. 이름 필수(공백 불가)·성별은 M/F/null 만 허용 — 위반 시 4xx 한국어 {detail}.

    문자열 detail 이라야 lib/api.ts 가 그대로 보여준다(422 리스트 detail 회피, AD-10).
    """
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름을 입력해 주세요.")
    if payload.gender is not None and payload.gender not in _ALLOWED_GENDERS:
        raise HTTPException(status_code=400, detail="성별 값이 올바르지 않아요.")
    row = patients_db.insert_patient(
        name,
        payload.birth_date,
        payload.gender,
        payload.phone,
    )
    return _to_patient_out(row)


def list_patients(search: str | None) -> list[PatientOut]:
    """환자 목록을 정규 응답 모델로 돌려준다(FR-5). search 있으면 이름 부분 일치 필터.

    검색어 정규화(공백 제거·빈값→None)를 여기서 소유한다 — db 계층은 SQL I/O 만.
    직원 전체 접근 화면이라 patient_id 스코핑(AD-8)은 쓰지 않는다(그건 환자용 조회 규약).
    """
    term = (search or "").strip() or None
    rows = patients_db.fetch_patients(term)
    return [_to_patient_out(row) for row in rows]


def _to_patient_out(row: dict) -> PatientOut:
    """db dict 행 → PatientOut 매핑. POST·GET 이 같은 정규 모델을 쓰도록 한 곳에서 매핑(AD-10)."""
    return PatientOut(
        id=row["id"],
        name=row["name"],
        birth_date=row["birth_date"],
        gender=row["gender"],
        phone=row["phone"],
    )
