"""진료 기록 비즈니스 규칙 계층 (AD-2). 확정 가드·스냅샷 계약을 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from datetime import timezone

from fastapi import HTTPException
from psycopg.errors import ForeignKeyViolation, UniqueViolation

from app.db import appointments as appointments_db
from app.db import medical_records as medical_records_db
from app.schemas.medical_records import (
    MedicalRecordCreate,
    MedicalRecordOut,
    PrescriptionOut,
)

# prescription.days 는 int4 컬럼 — 이 범위를 넘는 값은 CTE 의 `days int` 캐스트에서 overflow 로
# 500 이 된다(전역 핸들러가 "일시적 서버 오류" 로 감싸 영구 입력 오류를 재시도 안내로 오인시킴).
# 앱이 규칙을 소유하므로(days<1 과 같은 원리) 상한도 여기서 400 으로 먼저 거부한다(도메인 제한 발명이
# 아니라 컬럼 타입 경계 방어 — AC 는 상한을 두지 않으므로 int4 max 안쪽 값은 그대로 저장된다).
_DAYS_MAX = 2_147_483_647  # PostgreSQL int4 max


def create_medical_record(payload: MedicalRecordCreate) -> MedicalRecordOut:
    """확정 예약에 진료 기록을 작성하고 같은 트랜잭션에서 예약을 완료로 전이한다(FR-8·FR-9, Story 3.1).

    처방 0..N(FR-10, Story 3.2)도 같은 문장에서 함께 쓴다 — 별도 db 호출로 쪼개지 않는다(원자성).

    가드 체인(순서 고정 — 2.2/2.3 미러, 기존 번호 유지):
    ① 진단명 빈 값 400 ② 없는 예약 404 ③ 확정 아닌 예약 400(상태별 문구, AD-5)
    ④ doctor_id null 400(FR-9 — NOT NULL 삽입 500 전에 앱이 먼저 거부)
    ④' 처방 일수 < 1 → 400(FR-10 — DB days 엔 CHECK 없음, 앱이 규칙 소유)
    ⑤ UniqueViolation → 409(예약당 기록 1건, AC4) ⑤' ForeignKeyViolation(없는 drug_id) → 400
    ⑥ CAS 0행(경합) → 409(2.2 문구).
    위반은 모두 4xx + 문자열 {detail}(한국어) — lib/api.ts 가 그대로 보여준다(AD-10).

    완료 전이는 이 tx 의 부작용으로만 존재한다(AD-5) — appointments 서비스의
    _CLIENT_SETTABLE_STATUS 가 완료를 제외한 이유. set_appointment_status 를 호출하지 않는다.
    ⚠️ walk-in(appointment_id 없이)은 Story 5.3, 기록·처방 조회는 Epic 4, 슬롯 점유는 Epic 5.
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

    # ④' 처방 일수는 1 이상 int4 max 이하(FR-10) — DB days 엔 CHECK 가 없어 앱이 규칙을 소유한다
    # (①과 같은 원리. Pydantic ge=1 은 422 리스트 detail 로 붕괴돼 쓰지 않는 확립 패턴 — 400 한국어로
    # 먼저 거부). 상한(int4)을 열어 두면 큰 값이 CTE 캐스트에서 overflow → 500 이 되므로 함께 막는다.
    if any(
        p.days is not None and not (1 <= p.days <= _DAYS_MAX)
        for p in payload.prescriptions
    ):
        raise HTTPException(
            status_code=400,
            detail="처방 일수는 1 이상의 숫자로 입력해 주세요.",
        )

    # 시각 규약: tz-naive visited_at 은 UTC 로 간주한다(slots.to_slot 과 동일 규약) — 원시 바인딩은
    # Postgres 세션 TimeZone 에 해석을 맡겨, 세션 tz 가 UTC 가 아니면 저장 시점이 조용히 밀린다.
    visited_at = payload.visited_at
    if visited_at.tzinfo is None:
        visited_at = visited_at.replace(tzinfo=timezone.utc)

    # 스냅샷 3필드는 여기서 전달하지 않는다 — SQL 이 예약 행에서 그 순간 값을 복사한다(AD-6).
    # 처방은 dict 리스트로 전달 — 같은 CTE 문이 기록·완료 전이와 함께 한 번에 쓴다(AC2).
    try:
        row = medical_records_db.insert_medical_record_and_complete(
            payload.appointment_id,
            visited_at,
            diagnosis,
            payload.notes,
            [p.model_dump() for p in payload.prescriptions],
        )
    except UniqueViolation as exc:
        # ⑤ 부분 유니크(uq_medical_record_appointment) — 예약당 기록 1건(AC4).
        # 단일 문장이라 완료 전이도 함께 롤백됐다(기록 없이 완료되는 예약 없음).
        raise HTTPException(
            status_code=409,
            detail="이미 진료 기록이 있는 예약이에요.",
        ) from exc
    except ForeignKeyViolation as exc:
        # ⑤' 이 문장에서 클라이언트가 넣는 FK 는 drug_id 뿐(나머지는 예약 행 복사) — 위반은 사실상
        # 존재하지 않는 약(재시드 후 id 이동 등). 전역 500 대신 친절한 400 한국어로(AD-10,
        # appointments 의 patient FK catch 미러). 단일 문장이라 기록·전이·다른 처방도 함께 롤백됐다.
        raise HTTPException(
            status_code=400,
            detail="선택한 약을 찾을 수 없어요. 약을 다시 선택해 주세요.",
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
        # jsonb 집계는 psycopg 가 list[dict] 로 파싱해 준다 — 키가 PrescriptionOut 과 1:1(AD-10 flat).
        prescriptions=[PrescriptionOut(**p) for p in row["prescriptions"]],
    )
