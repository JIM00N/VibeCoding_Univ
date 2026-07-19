"""예약 비즈니스 규칙 계층 (AD-2). 검증·슬롯 정규화·매핑을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from fastapi import HTTPException
from psycopg.errors import ForeignKeyViolation

from app.db import appointments as appointments_db
from app.schemas.appointments import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentStatusUpdate,
)
from app.slots import to_slot

# 클라이언트가 정할 수 있는 목표 status — 확정/취소만. '완료'는 Epic 3 진료기록의 tx 부작용이라
# 여기서 허용하지 않는다(AD-5). '대기'로 되돌리기도 없음.
_CLIENT_SETTABLE_STATUS = ("확정", "취소")

# 목표 status 별 허용 출발 status(전이 적격성, AD-5 — 예약 서비스만 status 를 소유한다).
#   확정: 대기에서만  /  취소: 대기·확정에서만.
_ALLOWED_SOURCE = {
    "확정": ("대기",),
    "취소": ("대기", "확정"),
}


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


def list_appointments() -> list[AppointmentOut]:
    """전체 예약 목록을 정규 응답 모델로 돌려준다(FR-7, 직원 전체 접근).

    patient_id 스코핑(AD-8)은 환자용 조회 규약이라 여기 해당 없음 — 직원은 전체를 본다(Epic 4는 별개).
    """
    rows = appointments_db.fetch_appointments()
    return [_to_appointment_out(row) for row in rows]


def set_appointment_status(
    appointment_id: int, payload: AppointmentStatusUpdate
) -> AppointmentOut:
    """예약 status 전이(확정/취소). 예약 서비스만 status 를 소유한다(AD-5).

    - 목표값은 확정/취소만(그 외 400). 완료는 클라이언트가 못 정함(Epic 3 tx 부작용).
    - 전이 적격성: 확정은 대기에서만, 취소는 대기/확정에서만. 위반 시 400 한국어.
    - 없는 예약은 404. 거부·검증 위반은 4xx + 문자열 {detail}(lib/api.ts 가 그대로 표시, AD-10).

    ⚠️ 슬롯 점유/해제(check_and_occupy)는 Epic 5. 취소는 status 전이만 — Epic 5 충돌 쿼리가
    취소를 제외하므로 슬롯 해제가 자연히 성립한다. 의사 변경(재배정)은 Story 2.3.
    """
    target = payload.status
    if target not in _CLIENT_SETTABLE_STATUS:
        raise HTTPException(status_code=400, detail="확정 또는 취소만 가능해요.")

    current = appointments_db.fetch_appointment(appointment_id)
    if current is None:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없어요.")

    if current["status"] not in _ALLOWED_SOURCE[target]:
        raise HTTPException(
            status_code=400,
            detail=_reject_message(current["status"], target),
        )

    row = appointments_db.update_appointment_status(appointment_id, target)
    if row is None:
        # 바로 위에서 존재를 확인했으므로 도달 불가 — 타입 정직·방어적 가드(2.1 패턴).
        raise HTTPException(
            status_code=500,
            detail="예약 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.",
        )
    return _to_appointment_out(row)


def _reject_message(current_status: str, target: str) -> str:
    """전이 거부 사유를 사람이 읽는 한국어로 안내한다(UX-DR10 — 정직·실행 가능)."""
    if target == "확정":
        return "대기 상태 예약만 확정할 수 있어요."
    # target == "취소"
    if current_status == "취소":
        return "이미 취소된 예약이에요."
    if current_status == "완료":
        return "이미 완료된 예약이라 취소할 수 없어요."
    return "이 예약은 취소할 수 없어요."


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
