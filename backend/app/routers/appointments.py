"""예약 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.appointments import AppointmentCreate, AppointmentOut
from app.services import appointments as appointments_service

router = APIRouter(tags=["appointments"])


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def create_appointment(payload: AppointmentCreate) -> AppointmentOut:
    """환자 예약 생성(FR-6, P0). 생성된 예약을 정규 모델(status=대기)로 반환(201).

    슬롯 충돌 검사는 Epic 5(FR-15) — P0는 검사 없이 생성한다.
    """
    return appointments_service.create_appointment(payload)
