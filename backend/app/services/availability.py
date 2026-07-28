"""가용성 비즈니스 규칙 계층 (AD-2). 파라미터 정규화를 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from datetime import datetime

from app.db import availability as availability_db
from app.schemas.availability import AvailabilityOut
from app.slots import ensure_utc


def get_taken_slots(
    doctor_id: int, start: datetime, end: datetime, patient_id: int | None = None
) -> AvailabilityOut:
    """한 의사의 [start, end) 점유 슬롯을 정규 모델로 돌려준다(슬롯 피커 taken 사전 표시용).

    tz-naive 입력은 UTC 로 간주한다 — to_slot·기록 서비스와 같은 규약(공유 ensure_utc, Story 5.4).

    patient_id 가 오면 환자 축(FR-15b)도 함께 싣는다 — 006 부분 유니크 인덱스가 만든 거부
    클래스는 의사 축 조회로는 보이지 않아, 없으면 제출해야만 알 수 있다(코드리뷰 High).
    없으면 환자 축 조회를 아예 하지 않는다(불필요한 왕복 금지 + 기존 계약 보존).
    """
    start_utc, end_utc = ensure_utc(start), ensure_utc(end)
    taken = availability_db.select_taken_slots(doctor_id, start_utc, end_utc)
    patient_taken = (
        availability_db.select_patient_taken_slots(patient_id, start_utc, end_utc)
        if patient_id is not None
        else []
    )
    return AvailabilityOut(doctor_id=doctor_id, taken=taken, patient_taken=patient_taken)
