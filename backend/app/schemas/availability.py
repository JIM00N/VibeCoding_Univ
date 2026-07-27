"""가용성 응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AvailabilityOut(BaseModel):
    """한 의사의 점유 슬롯 목록(Story 5.1, FR-15). taken = 30분 슬롯 시작 시각(ISO-8601 UTC).

    프런트는 문자열 비교가 아니라 epoch ms 로 정규화해 슬롯 셀과 매칭한다 — Pydantic 직렬화
    오프셋 표기와 프런트 슬롯 iso("Z") 표기가 문자열로는 어긋날 수 있다(스토리 Dev Notes).
    """

    doctor_id: int
    taken: list[datetime]
