"""슬롯 정규화 공유 순수함수 (AD-3).

점유 판정의 source of truth 는 SQL 충돌 쿼리(Epic 5, AD-4)다. 이 Python `to_slot()` 은
그 floor 식을 **그대로 미러링**해 예약 시각 검증·UX 표시에만 쓴다(원시 timestamp 직접 비교 금지).

슬롯 = 시각을 30분 격자로 floor(UTC 기준). minute 기반이라 KST 같은 정시-오프셋 tz 에서 tz-불변.
"""
from __future__ import annotations

from datetime import datetime, timezone


def to_slot(dt: datetime) -> datetime:
    """주어진 시각을 30분 UTC 격자로 내림(floor)한 슬롯 키를 돌려준다.

    - tz-naive 입력은 UTC 로 간주한다.
    - 반환값은 항상 UTC, 분 ∈ {0, 30}, 초·마이크로초 = 0.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    minute = 0 if dt.minute < 30 else 30
    return dt.replace(minute=minute, second=0, microsecond=0)
