"""환자 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.patients import PatientCreate, PatientOut
from app.services import patients as patients_service

router = APIRouter(tags=["patients"])


@router.post("/patients", response_model=PatientOut, status_code=201)
def create_patient(payload: PatientCreate) -> PatientOut:
    """신규 환자 등록(FR-4). 생성된 환자를 정규 모델로 반환(201)."""
    return patients_service.create_patient(payload)


@router.get("/patients", response_model=list[PatientOut])
def list_patients(search: str | None = None) -> list[PatientOut]:
    """환자 목록 조회·이름 검색(FR-5). ?search= 있으면 이름 부분 일치 필터, 없으면 전체.

    POST 와 같은 PatientOut 리스트를 돌려준다(리소스당 정규 모델 1개, AD-10).
    직원 전체 접근이라 patient_id 스코핑 없음. Story 1.5(환자 신원 선택)가 이 엔드포인트를 재사용한다.
    """
    return patients_service.list_patients(search)
