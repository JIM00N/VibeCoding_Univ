"""예약 비즈니스 규칙 계층 (AD-2). 검증·슬롯 정규화·매핑을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from fastapi import HTTPException
from psycopg.errors import ForeignKeyViolation

from app.db import appointments as appointments_db
from app.schemas.appointments import AppointmentCreate, AppointmentOut
from app.slots import to_slot


def create_appointment(payload: AppointmentCreate) -> AppointmentOut:
    """예약을 생성한다(FR-6, P0). status=대기, doctor_id 채워짐.

    규칙:
    - reserved_at 을 to_slot() 으로 30분 격자에 floor 해 저장 → DB CHECK 통과(AC4, AD-3/AD-9).
    - 담당 의사 필수(P0 직접 선택). 미지정이면 400 한국어(AC3).
    - 선택 의사가 선택 진료과 소속이어야 한다 — DB FK 가 소속 일치를 강제하지 않으므로 앱이 검증(AD-6).
    위반은 모두 4xx + 문자열 {detail}(한국어) — lib/api.ts 가 그대로 보여준다(AD-10).

    ⚠️ 슬롯 충돌 검사(check_and_occupy)는 Epic 5(FR-15). P0는 검사 없이 생성한다.
    """
    # AC4: 30분 격자로 floor(원시 입력을 그대로 넣으면 reserved_at CHECK 위반 → 원시 DB 에러).
    slot = to_slot(payload.reserved_at)

    # AC3: 담당 의사 직접 선택 필수(P0). 프런트가 인라인으로 먼저 막지만 서버가 최종 관문.
    if not payload.doctor_id:
        raise HTTPException(status_code=400, detail="담당 의사를 선택해 주세요.")

    # AD-6: 의사↔진료과 소속 정합을 앱이 검증(FK 는 존재만 보장).
    doctor_hd = appointments_db.fetch_doctor_department(payload.doctor_id)
    if doctor_hd is None:
        raise HTTPException(status_code=400, detail="담당 의사를 찾을 수 없어요. 다시 선택해 주세요.")
    if doctor_hd != payload.hospital_department_id:
        raise HTTPException(
            status_code=400,
            detail="선택한 진료과의 담당 의사가 아니에요. 의사를 다시 선택해 주세요.",
        )

    try:
        row = appointments_db.insert_appointment(
            payload.patient_id,
            payload.hospital_department_id,
            payload.doctor_id,
            slot,
        )
    except ForeignKeyViolation as exc:
        # 의사·진료과는 위에서 검증했으므로 남은 FK 위반은 사실상 존재하지 않는 patient_id
        # (오래된 localStorage 신원·재시드 후 id 이동 등). 전역 500 대신 친절한 400 한국어로(AD-10).
        raise HTTPException(
            status_code=400,
            detail="선택한 환자 정보를 찾을 수 없어요. 환자를 다시 선택해 주세요.",
        ) from exc
    if row is None:
        # FK 가 유효하면 조인 결과가 항상 1행이라 도달 불가 — 타입 정직·방어적 가드.
        raise HTTPException(
            status_code=500,
            detail="예약 생성 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        )
    return _to_appointment_out(row)


def _to_appointment_out(row: dict) -> AppointmentOut:
    """db dict 행 → AppointmentOut 매핑. 리소스당 정규 모델 하나로 한 곳에서 매핑(AD-10)."""
    return AppointmentOut(
        id=row["id"],
        patient_id=row["patient_id"],
        hospital_department_id=row["hospital_department_id"],
        doctor_id=row["doctor_id"],
        reserved_at=row["reserved_at"],
        status=row["status"],
        patient_name=row["patient_name"],
        doctor_name=row["doctor_name"],
        department_name=row["department_name"],
    )
