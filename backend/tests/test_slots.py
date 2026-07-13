"""to_slot() 순수함수 테스트 (AD-3): 30분 UTC 격자로 floor."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.slots import to_slot


def test_floors_to_lower_half_hour():
    dt = datetime(2026, 7, 14, 10, 17, 42, tzinfo=timezone.utc)
    assert to_slot(dt) == datetime(2026, 7, 14, 10, 0, 0, tzinfo=timezone.utc)


def test_floors_to_upper_half_hour():
    dt = datetime(2026, 7, 14, 10, 47, 3, tzinfo=timezone.utc)
    assert to_slot(dt) == datetime(2026, 7, 14, 10, 30, 0, tzinfo=timezone.utc)


def test_exact_boundary_is_stable():
    dt = datetime(2026, 7, 14, 10, 30, 0, tzinfo=timezone.utc)
    assert to_slot(dt) == dt


def test_naive_is_treated_as_utc():
    dt = datetime(2026, 7, 14, 9, 5, 0)
    assert to_slot(dt) == datetime(2026, 7, 14, 9, 0, 0, tzinfo=timezone.utc)


def test_non_utc_tz_normalized_to_utc_grid():
    # KST(+9) 18:20 == UTC 09:20 → 슬롯 09:00 UTC
    kst = timezone(timedelta(hours=9))
    dt = datetime(2026, 7, 14, 18, 20, 0, tzinfo=kst)
    assert to_slot(dt) == datetime(2026, 7, 14, 9, 0, 0, tzinfo=timezone.utc)
