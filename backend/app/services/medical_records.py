"""진료 기록 비즈니스 규칙 계층 (AD-2). 확정 가드·스냅샷 계약을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from fastapi import HTTPException
from psycopg.errors import UniqueViolation

from app.db import appointments as appointments_db
from app.db import medical_records as medical_records_db
from app.schemas.medical_records import MedicalRecordCreate, MedicalRecordOut


def create_medical_record(payload: MedicalRecordCreate) -> MedicalRecordOut:
    """확정 예약에 진료 기록을 작성하고 같은 트랜잭션에서 예약을 완료로 전이한다(FR-8·FR-9, Story 3.1).

    가드 체인(순서 고정 — 2.2/2.3 미러):
    ① 진단명 빈 값 400 ② 없는 예약 404 ③ 확정 아닌 예약 400(상태별 문구, AD-5)
    ④ doctor_id null 400(FR-9 — NOT NULL 삽입 500 전에 앱이 먼저 거부)
    ⑤ UniqueViolation → 409(예약당 기록 1건, AC4) ⑥ CAS 0행(경합) → 409(2.2 문구).
    위반은 모두 4xx + 문자열 {detail}(한국어) — lib/api.ts 가 그대로 보여준다(AD-10).

    완료 전이는 이 tx 의 부작용으로만 존재한다(AD-5) — appointments 서비스의
    _CLIENT_SETTABLE_STATUS 가 완료를 제외한 이유. set_appointment_status 를 호출하지 않는다.
    ⚠️ 처방(0..N)은 Story 3.2, walk-in(appointment_id 없이)은 Story 5.3, 슬롯 점유는 Epic 5.
    """
    # ① 진단명 필수(공백만도 불가) — DB 는 nullable 이라 앱이 규칙을 소유한다(UX 목업 필수 *).
    diagnosis = payload.diagnosis.strip()
    if not diagnosis:
        raise HTTPException(status_code=400, detail="진단명을 입력해 주세요.")

    # ② 존재 확인(404) + ③④ 상태·의사 적격성 검증용 현재 예약 로드.
    current = appointments_db.fetch_appointment(payload.appointment_id)
    if current is None:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없어요.")

    # ③ 확정 예약에만 작성(AD-5 서비스 가드). 상태별 정직·실행 가능 문구(UX-DR10).
    if current["status"] != "확정":
        if current["status"] == "대기":
            detail = "아직 확정되지 않은 예약이에요. 예약을 확정한 뒤 기록을 작성해 주세요."
        elif current["status"] == "취소":
            detail = "취소된 예약에는 진료 기록을 작성할 수 없어요."
        elif current["status"] == "완료":
            detail = "이미 진료가 완료된 예약이에요."
        else:
            detail = "이 예약에는 진료 기록을 작성할 수 없어요."
        raise HTTPException(status_code=400, detail=detail)

    # ④ 작성 시점에 담당 의사 필요(FR-9). P0 앱은 항상 채우지만(2.1) null 이면 먼저 거부.
    if current["doctor_id"] is None:
        raise HTTPException(
            status_code=400,
            detail="담당 의사가 지정되지 않은 예약이에요. 담당 의사를 먼저 지정해 주세요.",
        )

    # 스냅샷 3필드는 여기서 전달하지 않는다 — SQL 이 예약 행에서 그 순간 값을 복사한다(AD-6).
    try:
        row = medical_records_db.insert_medical_record_and_complete(
            payload.appointment_id,
            payload.visited_at,
            diagnosis,
            payload.notes,
        )
    except UniqueViolation as exc:
        # ⑤ 부분 유니크(uq_medical_record_appointment) — 예약당 기록 1건(AC4).
        # 단일 문장이라 완료 전이도 함께 롤백됐다(기록 없이 완료되는 예약 없음).
        raise HTTPException(
            status_code=409,
            detail="이미 진료 기록이 있는 예약이에요.",
        ) from exc
    if row is None:
        # ⑥ 검증과 INSERT 사이에 status 가 확정 밖으로 바뀐 경합 — CTE CAS 가 막았다(2.2 문구).
        raise HTTPException(
            status_code=409,
            detail="예약 상태가 방금 바뀌었어요. 목록을 새로고침한 뒤 다시 확인해 주세요.",
        )
    return _to_medical_record_out(row)


def _to_medical_record_out(row: dict) -> MedicalRecordOut:
    """db dict 행 → MedicalRecordOut 매핑. 리소스당 정규 모델 하나로 한 곳에서 매핑(AD-10)."""
    return MedicalRecordOut(
        id=row["id"],
        appointment_id=row["appointment_id"],
        patient_id=row["patient_id"],
        hospital_department_id=row["hospital_department_id"],
        doctor_id=row["doctor_id"],
        visited_at=row["visited_at"],
        diagnosis=row["diagnosis"],
        notes=row["notes"],
        patient_name=row["patient_name"],
        doctor_name=row["doctor_name"],
        department_name=row["department_name"],
    )
