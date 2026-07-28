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
    # 환자 축(FR-15b, 2026-07-28 chore) — 그 환자가 이미 잡은 활성 예약 슬롯. taken 과 **섞지
    # 않는다**: taken 의 의미("그 의사가 찼다")를 보존해야 기존 소비자가 회귀 없고, 자동 배정의
    # 의사 교집합 계산도 이 축을 섞으면 망가진다(환자 축은 의사와 무관해 교집합 대상이 아니다).
    # patient_id 쿼리 파라미터가 없으면 항상 빈 배열(키는 언제나 존재 — AD-10 모양 고정).
    patient_taken: list[datetime] = []
