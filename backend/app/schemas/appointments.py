"""예약 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AppointmentCreate(BaseModel):
    """예약 생성 요청(FR-6, P0). 환자·진료과·의사·시각을 받는다.

    - doctor_id 는 P0에서 직접 선택 필수지만 스키마상 nullable 로 두고 서비스가 400 한국어로 막는다
      (Pydantic 필수 누락은 422 리스트 detail 이라 lib/api.ts 가 일반 메시지로 바꾼다, AD-10).
    - reserved_at 은 ISO-8601. 서비스가 to_slot() 으로 30분 격자에 floor 해 저장한다(AC4, AD-3).
    """

    patient_id: int
    hospital_department_id: int
    doctor_id: int | None = None
    reserved_at: datetime


class AppointmentOut(BaseModel):
    """예약 정규 응답. 정수 FK id + 평평한 표시 필드(nested 금지, AD-10).

    - reserved_at 은 ISO-8601 UTC(timestamptz)로 직렬화된다.
    - status 는 대기·확정·완료·취소 한국어 문자열 그대로(스파인 Consistency). 생성 직후엔 대기.
    - doctor_id/doctor_name 은 스키마상 nullable(LEFT JOIN 정직) — P0는 항상 채워진다.
    """

    id: int
    patient_id: int
    hospital_department_id: int
    doctor_id: int | None = None
    reserved_at: datetime
    status: str
    patient_name: str
    doctor_name: str | None = None
    department_name: str
