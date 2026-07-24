"""진료 기록 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.medical_records import MedicalRecordCreate, MedicalRecordOut
from app.services import medical_records as medical_records_service

router = APIRouter(tags=["medical-records"])


@router.post("/medical-records", response_model=MedicalRecordOut, status_code=201)
def create_medical_record(payload: MedicalRecordCreate) -> MedicalRecordOut:
    """확정 예약에 진료 기록 작성(FR-9, Story 3.1). 생성된 기록을 정규 모델로 반환(201).

    같은 트랜잭션에서 그 예약이 확정→완료로 전이된다(FR-8, AD-5 — tx 부작용).
    확정 가드·스냅샷 복사(AD-6)·거부는 서비스가 소유한다.
    처방(0..N)은 Story 3.2, 기록 조회(GET)는 Epic 4, walk-in 은 Story 5.3.
    """
    return medical_records_service.create_medical_record(payload)
