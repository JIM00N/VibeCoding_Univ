"""가용성 비즈니스 규칙 계층 (AD-2). 파라미터 정규화를 소유하고 db 계층을 호출한다."""
from __future__ import annotations

from datetime import datetime, timezone

from app.db import availability as availability_db
from app.schemas.availability import AvailabilityOut


def get_taken_slots(doctor_id: int, start: datetime, end: datetime) -> AvailabilityOut:
    """한 의사의 [start, end) 점유 슬롯을 정규 모델로 돌려준다(슬롯 피커 taken 사전 표시용).

    tz-naive 입력은 UTC 로 간주한다 — to_slot(app/slots.py)·기록 서비스와 같은 규약
    (인라인 2줄 정규화: 공유 ensure_utc 헬퍼 승격은 중복 사본 정리 스토리 몫).
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    taken = availability_db.select_taken_slots(
        doctor_id, start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    )
    return AvailabilityOut(doctor_id=doctor_id, taken=taken)
