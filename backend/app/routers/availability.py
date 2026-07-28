"""가용성 라우터 — HTTP·검증만 (AD-2)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from app.schemas.availability import AvailabilityOut
from app.services import availability as availability_service

router = APIRouter(tags=["availability"])


@router.get("/availability", response_model=AvailabilityOut)
def get_availability(
    doctor_id: int, start: datetime, end: datetime, patient_id: int | None = None
) -> AvailabilityOut:
    """한 의사의 [start, end) 점유 슬롯 목록(Story 5.1, FR-15) — 슬롯 피커 taken 사전 표시용.

    doctor_id·start·end 는 필수 쿼리 파라미터(누락은 422 — 프런트는 항상 셋 다 보낸다). 이 조회는
    예방용 사전 표시일 뿐, 최종 차단은 쓰기 시 게이트(단일 CTE 문 → 충돌 409)가 담당한다(UX-DR3
    "서버가 가용성의 진실"). walk-in 점유(medical_record)까지 합집합으로 본다(AD-4).

    patient_id 는 **선택**(FR-15b, 2026-07-28 chore) — 주면 그 환자가 이미 잡은 활성 슬롯을
    patient_taken 으로 함께 돌려준다. 기존 호출자는 무수정 호환(빈 배열).
    """
    return availability_service.get_taken_slots(doctor_id, start, end, patient_id)
