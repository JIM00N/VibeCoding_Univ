"""예약 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.appointments import (
    AppointmentCreate,
    AppointmentDoctorUpdate,
    AppointmentOut,
    AppointmentStatusUpdate,
)
from app.services import appointments as appointments_service

router = APIRouter(tags=["appointments"])


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def create_appointment(payload: AppointmentCreate) -> AppointmentOut:
    """환자 예약 생성(FR-6, P0). 생성된 예약을 정규 모델(status=대기)로 반환(201).

    슬롯 충돌 검사는 Epic 5(FR-15) — P0는 검사 없이 생성한다.
    """
    return appointments_service.create_appointment(payload)


@router.get("/appointments", response_model=list[AppointmentOut])
def list_appointments() -> list[AppointmentOut]:
    """직원 예약 목록(FR-7). 전체 예약을 정규 모델 리스트로 반환(최신순).

    직원 전체 접근이라 patient_id 스코핑 없음(환자용 조회는 Epic 4). 슬롯 충돌/점유는 Epic 5.
    """
    return appointments_service.list_appointments()


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment_status(
    appointment_id: int, payload: AppointmentStatusUpdate
) -> AppointmentOut:
    """예약 상태 전이(확정/취소, FR-7·FR-8) — 예약 서비스만 status 를 소유한다(AD-5).

    전이 규칙·거부는 서비스가 소유한다. 완료 전이는 Epic 3(진료기록 tx 부작용),
    담당 의사 변경(재배정)은 PATCH /appointments/{id}/doctor 가 담당한다.
    """
    return appointments_service.set_appointment_status(appointment_id, payload)


@router.patch("/appointments/{appointment_id}/doctor", response_model=AppointmentOut)
def update_appointment_doctor(
    appointment_id: int, payload: AppointmentDoctorUpdate
) -> AppointmentOut:
    """담당 의사 변경(재배정, FR-7 P0) — doctor_id 만 갱신하고 status 는 건드리지 않는다(AD-5).

    같은 진료과의 다른 의사만 허용(검증은 서비스 소유). 갱신된 예약을 정규 모델로 반환한다.
    (의사, 슬롯) 가용성 재검사는 Epic 5(FR-7 P1) — P0는 갱신만.
    """
    return appointments_service.set_appointment_doctor(appointment_id, payload)
