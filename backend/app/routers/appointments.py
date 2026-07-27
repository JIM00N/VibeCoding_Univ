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
    """예약 생성(FR-6 — 환자·직원 대리 공용 진입점). 정규 모델(status=대기)로 반환(201).

    (의사, 슬롯) 충돌은 409, 과거 시각은 400 으로 거부한다(Story 5.1, FR-15 — 검증은 서비스·db 게이트 소유).
    """
    return appointments_service.create_appointment(payload)


@router.get("/appointments", response_model=list[AppointmentOut])
def list_appointments(
    patient_id: int | None = None, doctor_id: int | None = None
) -> list[AppointmentOut]:
    """예약 목록(정규 모델 리스트).

    - 파라미터 없음: 직원 전체 목록(FR-7, 최신순) — 기존 계약 그대로(회귀 없음).
    - ?patient_id=: 그 환자의 예약만(Story 4.1, FR-11·AD-8, reserved_at desc). 앱 레벨 필터·보안 아님.
    - ?doctor_id=: 그 의사에게 배정된 예약만(Story 6.1, FR-17·AD-8, reserved_at desc). 앱 레벨 필터·보안 아님.
    점유 슬롯 사전 조회는 GET /availability(Story 5.1)가 담당한다.
    """
    return appointments_service.list_appointments(patient_id, doctor_id)


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: int) -> AppointmentOut:
    """예약 단건 조회(Story 3.1). 진료 기록 페이지가 대상 예약(상태·표시 필드)을 로드한다.

    목록·PATCH 와 같은 AppointmentOut 정규 모델(AD-10). 없으면 404 한국어.
    """
    return appointments_service.get_appointment(appointment_id)


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
    새 의사의 (의사, 슬롯) 점유는 자기 행 제외로 재검사해 충돌이면 409(Story 5.1, FR-7 P1).
    """
    return appointments_service.set_appointment_doctor(appointment_id, payload)
