"""예약 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AppointmentCreate(BaseModel):
    """예약 생성 요청(FR-6). 환자·진료과·의사·시각을 받는다.

    - doctor_id: 직접 선택한 의사 id, **None(미선택)이면 서비스가 그 진료과의 빈 의사를 자동
      배정한다**(P1, Story 5.2 — 전원 점유면 409). 0 등 falsy 유효하지 않은 id 는 자동이 아니라
      기존 검증 경로에서 400. (Pydantic 필수로 두지 않는 이유: 필수 누락은 422 리스트 detail 이라
      lib/api.ts 가 일반 메시지로 바꾼다, AD-10.)
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
    일정 변경(의사·시각)은 별도 요청 모델 AppointmentRescheduleUpdate(별도 경로)가 담당한다.
    extra="forbid" — doctor_id 등 다른 필드를 동봉하면 조용히 무시하지 않고 422(분리 고정).
    """

    model_config = ConfigDict(extra="forbid")

    status: str


class AppointmentRescheduleUpdate(BaseModel):
    """예약 일정 변경 요청(FR-19, Story 7.1). 담당 의사와 진료 시각을 한 번에 받는다.

    Story 2.3 의 AppointmentDoctorUpdate(`PATCH …/doctor`)를 대체한다 — 같은 행·같은 컬럼을
    놓고 두 경로가 경쟁하면 가용성 게이트가 두 벌이 되기 때문(제안서 §3.4).

    - 두 필드 모두 **선택**이다: 의사만·시각만·둘 다 전부 정당한 요청이다. 미지정 필드는
      서비스가 현재 값으로 채운다(SQL 분기 없음). doctor_id 미지정은 5.2 의 "자동 배정"이
      **아니다** — 자동 배정은 생성 전용이고, 여기서는 "현재 의사 유지"를 뜻한다.
    - **둘 다 없으면 서비스가 400 한국어**로 막는다(Pydantic 필수로 두지 않는 이유: 필수 누락은
      422 리스트 detail 이라 lib/api.ts 가 일반 메시지로 바꿔 직원이 이유를 못 본다, AD-10).
      값 검증(의사 존재·같은 진료과·무변경·과거 시각)도 전부 서비스가 400 문자열로 막는다.
    - reserved_at 은 ISO-8601. 서비스가 to_slot() 으로 30분 격자에 floor 해 저장한다(AD-3/AD-9).
    - extra="forbid" — status 를 동봉하면 조용히 무시하지 않고 422. status 소유권(AD-5)과
      일정 변경을 코드 경로 수준에서 분리해 둔다.
    - (의사, 슬롯) 가용성 재검사(자기 행 제외)와 환자 축 006 인덱스는 db 게이트가 수행한다 → 409.
    """

    model_config = ConfigDict(extra="forbid")

    doctor_id: int | None = None
    reserved_at: datetime | None = None


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
