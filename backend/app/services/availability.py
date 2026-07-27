"""가용성 비즈니스 규칙 계층 (AD-2). 파라미터 정규화를 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from datetime import datetime

from app.db import availability as availability_db
from app.schemas.availability import AvailabilityOut
from app.slots import ensure_utc


def get_taken_slots(doctor_id: int, start: datetime, end: datetime) -> AvailabilityOut:
    """한 의사의 [start, end) 점유 슬롯을 정규 모델로 돌려준다(슬롯 피커 taken 사전 표시용).

    tz-naive 입력은 UTC 로 간주한다 — to_slot·기록 서비스와 같은 규약(공유 ensure_utc, Story 5.4).
    """
    taken = availability_db.select_taken_slots(doctor_id, ensure_utc(start), ensure_utc(end))
    return AvailabilityOut(doctor_id=doctor_id, taken=taken)
