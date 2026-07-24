"""진료 기록 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class MedicalRecordCreate(BaseModel):
    """진료 기록 작성 요청(FR-9, Story 3.1). 확정 예약에만 작성 가능(가드는 서비스 소유, AD-5).

    - 스냅샷 3필드(patient_id·hospital_department_id·doctor_id)는 받지 않는다 — SQL 이 예약
      행에서 작성 시점 값을 복사한다(AD-6, 이력 불변). extra="forbid" 로 주입 시도를 422 거부.
    - diagnosis 는 str 필수지만 빈 값 검증은 서비스가 400 한국어로 막는다(Pydantic 422 리스트
      detail 은 lib/api.ts 가 일반 메시지로 바꾼다, AD-10 — min_length 를 넣지 않는 확립 패턴).
    - visited_at 은 ISO-8601. 30분 정렬 CHECK 없음(그건 reserved_at 전용) — 임의 시각 저장.
    - 처방(0..N)은 Story 3.2 — 이 모델에 처방 필드를 추가하지 않는다.
    """

    model_config = ConfigDict(extra="forbid")

    appointment_id: int
    diagnosis: str
    notes: str | None = None
    visited_at: datetime

    @field_validator("notes", mode="before")
    @classmethod
    def _blank_str_to_none(cls, v: object) -> object:
        # 프런트가 빈 문자열/공백 소견을 보내도 DB 엔 null 로 저장(빈 문자열 저장 방지, patients 미러).
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class MedicalRecordOut(BaseModel):
    """진료 기록 정규 응답. 정수 FK id + 평평한 표시 필드(nested 금지, AD-10).

    - patient_id·hospital_department_id·doctor_id 는 작성 시점에 예약 행에서 복사된 스냅샷(AD-6).
    - appointment_id 는 스키마상 nullable(walk-in, Story 5.3 정직) — 이 스토리 경로는 항상 채워진다.
    - visited_at 은 ISO-8601 UTC(timestamptz)로 직렬화된다. notes 는 소견 없으면 null.
    """

    id: int
    appointment_id: int | None = None
    patient_id: int
    hospital_department_id: int
    doctor_id: int
    visited_at: datetime
    diagnosis: str | None = None
    notes: str | None = None
    patient_name: str
    doctor_name: str
    department_name: str
