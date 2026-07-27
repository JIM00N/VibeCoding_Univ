"""예약 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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


class AppointmentStatusUpdate(BaseModel):
    """예약 상태 전이 요청(FR-7, FR-8). 확정 또는 취소.

    status 를 Literal 이 아니라 str 로 받는다 — 잘못된 값이 Pydantic 422(리스트 detail)면
    lib/api.ts 가 일반 메시지로 바꾼다. 서비스가 400 문자열 한국어로 막아 친절 문구를 띄운다(AD-10).
    '완료'는 여기로 못 온다(Epic 3 진료기록의 tx 부작용, AD-5).
    의사 변경(재배정)은 별도 요청 모델 AppointmentDoctorUpdate(별도 경로)가 담당한다.
    extra="forbid" — doctor_id 등 다른 필드를 동봉하면 조용히 무시하지 않고 422(분리 고정).
    """

    model_config = ConfigDict(extra="forbid")

    status: str


class AppointmentDoctorUpdate(BaseModel):
    """담당 의사 변경(재배정) 요청(FR-7, P0). 새 doctor_id 하나만 받는다.

    status 전이 요청(AppointmentStatusUpdate)과 경로·모델을 분리해 status 소유권(AD-5)과
    의사 변경을 섞지 않는다. doctor_id 는 int 필수 — 누락은 422(2.2 의 status 누락과 동일 계약),
    값 검증(의사 존재·같은 진료과·다른 의사)은 서비스가 400 한국어 문자열로 막는다(AD-10).
    extra="forbid" — status 등 다른 필드를 동봉하면 조용히 무시하지 않고 422(분리 고정).
    (의사, 슬롯) 가용성 재검사는 서비스·db 게이트가 수행한다(Story 5.1, FR-15 — 충돌 409).
    """

    model_config = ConfigDict(extra="forbid")

    doctor_id: int


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
