"""진료 기록 요청/응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _blank_str_to_none(v: object) -> object:
    """빈 문자열/공백을 None 으로 정규화(빈 문자열 저장 방지, patients 미러).

    notes 와 처방 dosage 가 공유한다 — 모델별 사본을 늘리지 않는다(deferred-work 경고 이행).
    """
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class PrescriptionCreate(BaseModel):
    """처방 행 요청(FR-10, Story 3.2). MedicalRecordCreate 의 하위 모델 — 별도 리소스가 아니다.

    - 약(drug_id)만 필수 — dosage·days 는 DB nullable 그대로 선택(발명 금지).
    - days ≥ 1 규칙은 서비스가 400 한국어로 막는다(Pydantic ge=1 을 넣지 않는 확립 패턴).
    - drug_name 등 표시 필드 주입은 extra="forbid" 로 422 — 서버 SQL 이 drug 에서 조인한다.
    """

    model_config = ConfigDict(extra="forbid")

    drug_id: int
    dosage: str | None = None
    days: int | None = None

    @field_validator("dosage", mode="before")
    @classmethod
    def _normalize_blank(cls, v: object) -> object:
        return _blank_str_to_none(v)


class MedicalRecordCreate(BaseModel):
    """진료 기록 작성 요청(FR-9, Story 3.1). 확정 예약에만 작성 가능(가드는 서비스 소유, AD-5).

    - 스냅샷 3필드(patient_id·hospital_department_id·doctor_id)는 받지 않는다 — SQL 이 예약
      행에서 작성 시점 값을 복사한다(AD-6, 이력 불변). extra="forbid" 로 주입 시도를 422 거부.
    - diagnosis 는 str 필수지만 빈 값 검증은 서비스가 400 한국어로 막는다(Pydantic 422 리스트
      detail 은 lib/api.ts 가 일반 메시지로 바꾼다, AD-10 — min_length 를 넣지 않는 확립 패턴).
    - visited_at 은 ISO-8601. 30분 정렬 CHECK 없음(그건 reserved_at 전용) — 임의 시각 저장.
    - prescriptions 는 0..N(FR-10, Story 3.2) — 생략·[] 모두 허용, 같은 CTE 문이 기록과 함께 쓴다.
    """

    model_config = ConfigDict(extra="forbid")

    appointment_id: int
    diagnosis: str
    notes: str | None = None
    visited_at: datetime
    prescriptions: list[PrescriptionCreate] = []

    @field_validator("notes", mode="before")
    @classmethod
    def _normalize_blank(cls, v: object) -> object:
        return _blank_str_to_none(v)


class PrescriptionOut(BaseModel):
    """처방 정규 응답(MedicalRecordOut 의 하위 모델). flat — drug 객체 중첩 금지(AD-10).

    drug_name 은 표시 필드(SQL 조인) — unit 은 싣지 않는다(FR 미사용, 필요 시 Epic 4 가 확장).
    """

    id: int
    drug_id: int
    drug_name: str
    dosage: str | None = None
    days: int | None = None


class MedicalRecordOut(BaseModel):
    """진료 기록 정규 응답. 정수 FK id + 평평한 표시 필드(nested 금지, AD-10).

    - patient_id·hospital_department_id·doctor_id 는 작성 시점에 예약 행에서 복사된 스냅샷(AD-6).
    - appointment_id 는 스키마상 nullable(walk-in, Story 5.3 정직) — 이 스토리 경로는 항상 채워진다.
    - visited_at 은 ISO-8601 UTC(timestamptz)로 직렬화된다. notes 는 소견 없으면 null.
    - prescription_printed_at(Story 3.3)은 마지막 처방전 출력 시각(ISO UTC) 또는 null(미출력).
      생성 직후엔 항상 null 이고, POST …/print 가 서버 now() 로 채운다 — 모든 medical-records
      엔드포인트가 이 필드를 포함해 같은 모양을 낸다(AD-10). 출력 여부 = not null.
    - prescriptions 는 기록에 합성된 자식 컬렉션(1:N, CASCADE)이라 리스트가 정합 표현 — AD-10 의
      "nested 금지"는 다:1 연관 객체를 막는 규칙이고, 각 항목은 flat 규칙을 지킨다(drug_id+drug_name).
      Epic 4 의 조회(FR-11 "진단·처방 포함")도 이 정규 모델 하나를 그대로 재사용한다.
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
    prescription_printed_at: datetime | None = None
    prescriptions: list[PrescriptionOut] = []
