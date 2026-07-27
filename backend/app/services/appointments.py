"""예약 비즈니스 규칙 계층 (AD-2). 검증·슬롯 정규화·매핑을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from psycopg.errors import ForeignKeyViolation

from app.db import appointments as appointments_db
from app.db.availability import SlotTakenError
from app.schemas.appointments import (
    AppointmentCreate,
    AppointmentDoctorUpdate,
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

# 담당 의사 변경(재배정)이 허용되는 출발 status — 대기·확정만(FR-7 P0).
# 완료는 이미 진료가 끝났고, 취소는 무효라 재배정 대상이 아니다(에픽 AC·addendum A4 점유 대상과 일치).
_DOCTOR_CHANGE_SOURCE = ("대기", "확정")


def create_appointment(payload: AppointmentCreate) -> AppointmentOut:
    """예약을 생성한다(FR-6, P0). status=대기, doctor_id 채워짐.

    규칙:
    - reserved_at 을 to_slot() 으로 30분 격자에 floor 해 저장 → DB CHECK 통과(AC4, AD-3/AD-9).
    - 담당 의사 필수(P0 직접 선택). 미지정이면 400 한국어(AC3).
    - 선택 의사가 선택 진료과 소속이어야 한다 — DB FK 가 소속 일치를 강제하지 않으므로 앱이 검증(AD-6).
    - (의사, 슬롯) 충돌은 db 게이트 문이 원자적으로 거부(Story 5.1, FR-15·AD-4) → 409.
    - 과거 시각은 서버가 최종 거부(Story 5.1 AC7) → 400.
    위반은 모두 4xx + 문자열 {detail}(한국어) — lib/api.ts 가 그대로 보여준다(AD-10).
    """
    # AC4: 30분 격자로 floor(원시 입력을 그대로 넣으면 reserved_at CHECK 위반 → 원시 DB 에러).
    slot = to_slot(payload.reserved_at)

    # Story 5.1 AC7: 과거 시각 서버 가드 — 프런트 필터·제출 재검증(표시·UX 층) 뒤의 최종 방어.
    # 슬롯 시작이 지난 진행 중 슬롯(예: 10:14 의 10:00)도 거부해 프런트 필터와 일관된다.
    # 생성 전용 — 의사 변경은 reserved_at 을 바꾸지 않아 과거 예약 재배정을 막지 않는다.
    if slot < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="이미 지난 시간이에요. 다른 시간을 골라 주세요.")

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
    except SlotTakenError as exc:
        # Story 5.1(FR-15): (의사, 슬롯) 점유 충돌 — 검사+삽입이 같은 문이라 원자적으로 거부됐다.
        # 409 = 다른 행이 점유(경합 성격). 프런트는 이 상태 코드로 "그 셀 taken 갱신" 분기를 태운다.
        raise HTTPException(
            status_code=409,
            detail="이 시간엔 이미 예약이 있어요. 다른 시간을 골라 주세요.",
        ) from exc
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


def get_appointment(appointment_id: int) -> AppointmentOut:
    """예약 1건을 정규 응답 모델로 돌려준다(Story 3.1 — 진료 기록 페이지의 대상 예약 로드).

    없으면 404 한국어(기존 문구 재사용). db 는 기존 fetch_appointment 를 그대로 쓴다(add-only).
    """
    row = appointments_db.fetch_appointment(appointment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없어요.")
    return _to_appointment_out(row)


def list_appointments(
    patient_id: int | None = None, doctor_id: int | None = None
) -> list[AppointmentOut]:
    """예약 목록을 정규 응답 모델로 돌려준다.

    - 파라미터 없음(기본): 전체 예약 — 직원 전체 접근(FR-7, 회귀 없음).
    - patient_id 있음: 그 환자의 예약만 — 환자용 조회(Story 4.1, FR-11·AD-8, 앱 레벨 필터·보안 아님).
    - doctor_id 있음: 그 의사에게 배정된 예약만 — 의사 대시보드(Story 6.1, FR-17·AD-8, 앱 레벨 필터·보안 아님).
    실사용상 두 필터는 상호배타(대시보드는 doctor_id 만, 환자 화면은 patient_id 만 보냄). 매핑은 어느
    경로든 같은 _to_appointment_out(리소스당 정규 모델 하나, AD-10).
    """
    if patient_id is not None:
        rows = appointments_db.fetch_appointments_by_patient(patient_id)
    elif doctor_id is not None:
        rows = appointments_db.fetch_appointments_by_doctor(doctor_id)
    else:
        rows = appointments_db.fetch_appointments()
    return [_to_appointment_out(row) for row in rows]


def set_appointment_status(
    appointment_id: int, payload: AppointmentStatusUpdate
) -> AppointmentOut:
    """예약 status 전이(확정/취소). 예약 서비스만 status 를 소유한다(AD-5).

    - 목표값은 확정/취소만(그 외 400). 완료는 클라이언트가 못 정함(Epic 3 tx 부작용).
    - 전이 적격성: 확정은 대기에서만, 취소는 대기/확정에서만. 위반 시 400 한국어.
    - 없는 예약은 404. 거부·검증 위반은 4xx + 문자열 {detail}(lib/api.ts 가 그대로 표시, AD-10).

    슬롯 점유/해제 로직은 여기 없다 — 취소는 status 전이만 하면 충돌 쿼리(db/availability.py,
    Story 5.1)가 취소를 제외하므로 슬롯 해제가 자연히 성립한다. 재배정은 set_appointment_doctor 담당.
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

    row = appointments_db.update_appointment_status(
        appointment_id, target, _ALLOWED_SOURCE[target]
    )
    if row is None:
        # 위에서 존재·적격을 확인했으나 UPDATE 시점에 status 가 바뀐 경합(동시 확정/취소 등).
        # compare-and-set 가드가 금지 전이를 막았다 — 새로고침 후 재확인을 안내한다(409 Conflict).
        raise HTTPException(
            status_code=409,
            detail="예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요.",
        )
    return _to_appointment_out(row)


def set_appointment_doctor(
    appointment_id: int, payload: AppointmentDoctorUpdate
) -> AppointmentOut:
    """예약의 담당 의사를 같은 진료과의 다른 의사로 변경한다(FR-7 P0, 재배정).

    - 대기·확정 예약만 변경 가능(완료·취소는 400). status 는 어떤 경로에서도 바꾸지 않는다(AD-5).
    - 새 의사는 존재해야 하고(400), 그 예약의 진료과 소속이어야 하며(400 — 2.1 문구 재사용),
      현재 담당 의사와 달라야 한다(400). 과 이동(hospital_department_id 변경)은 스코프 밖.
    - UPDATE 는 compare-and-set(대기·확정 조건) — 검증과 UPDATE 사이 status 경합에서도
      부적격 재배정이 성립하지 않는다. 0행이면 409(2.2 와 동일 안내).
    - (의사, 슬롯) 가용성 재검사(Story 5.1, FR-7 P1·AD-4): 새 의사의 점유를 자기 행 제외로
      같은 문 안에서 검사, 충돌이면 409(CAS 409 와 문구로 구분). 이전 슬롯 해제 + 새 슬롯
      점유는 doctor_id 단일 UPDATE 로 원자 성립한다.
    """
    current = appointments_db.fetch_appointment(appointment_id)
    if current is None:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없어요.")

    if current["status"] not in _DOCTOR_CHANGE_SOURCE:
        if current["status"] == "완료":
            detail = "완료된 예약은 담당 의사를 바꿀 수 없어요."
        elif current["status"] == "취소":
            detail = "취소된 예약은 담당 의사를 바꿀 수 없어요."
        else:
            detail = "이 예약은 담당 의사를 바꿀 수 없어요."
        raise HTTPException(status_code=400, detail=detail)

    # AD-6: 의사↔진료과 소속 정합을 앱이 검증(2.1 create_appointment 와 같은 함수·문구).
    doctor_hd = appointments_db.fetch_doctor_department(payload.doctor_id)
    if doctor_hd is None:
        raise HTTPException(status_code=400, detail="담당 의사를 찾을 수 없어요. 다시 선택해 주세요.")
    if doctor_hd != current["hospital_department_id"]:
        raise HTTPException(
            status_code=400,
            detail="선택한 진료과의 담당 의사가 아니에요. 의사를 다시 선택해 주세요.",
        )

    # 에픽 AC: "같은 진료과의 **다른** 의사" — 같은 의사로의 변경은 무의미라 거부.
    if payload.doctor_id == current["doctor_id"]:
        raise HTTPException(
            status_code=400,
            detail="이미 담당하고 있는 의사예요. 다른 의사를 선택해 주세요.",
        )

    try:
        row = appointments_db.update_appointment_doctor(
            appointment_id, payload.doctor_id, _DOCTOR_CHANGE_SOURCE
        )
    except SlotTakenError as exc:
        # Story 5.1(FR-7 P1): 새 의사가 그 슬롯에 이미 점유 — CAS 409 와 문구로 구분되는 409.
        raise HTTPException(
            status_code=409,
            detail="이 시간엔 선택한 의사의 예약이 이미 있어요. 다른 의사를 선택해 주세요.",
        ) from exc
    if row is None:
        # 검증과 UPDATE 사이에 status 가 완료/취소로 바뀐 경합 — CAS 가드가 재배정을 막았다.
        raise HTTPException(
            status_code=409,
            detail="예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요.",
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
