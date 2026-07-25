"""진료 기록 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.medical_records import MedicalRecordCreate, MedicalRecordOut
from app.services import medical_records as medical_records_service

router = APIRouter(tags=["medical-records"])


@router.post("/medical-records", response_model=MedicalRecordOut, status_code=201)
def create_medical_record(payload: MedicalRecordCreate) -> MedicalRecordOut:
    """확정 예약에 진료 기록 작성(FR-9, Story 3.1). 생성된 기록을 정규 모델로 반환(201).

    같은 트랜잭션에서 그 예약이 확정→완료로 전이되고, body 의 처방 0..N(FR-10, Story 3.2)도
    함께 생성된다. 확정 가드·처방 규칙·스냅샷 복사(AD-6)·거부는 서비스가 소유한다.
    walk-in 은 Story 5.3.
    """
    return medical_records_service.create_medical_record(payload)


@router.get("/medical-records", response_model=list[MedicalRecordOut])
def list_medical_records(
    appointment_id: int | None = None, patient_id: int | None = None
) -> list[MedicalRecordOut]:
    """진료 기록·처방 조회 — 필터 두 종(둘 다 optional, 하나로 분기).

    - ?appointment_id=: 그 예약의 기록(직원 처방전 화면, Story 3.3) — 3.3 계약 그대로(회귀 없음).
    - ?patient_id=: 그 환자의 지난 기록 전체(환자용 조회, Story 4.1, FR-11·AD-8, visited_at desc).
    둘 다 없으면 서비스가 400 한국어(조회 조건 필수). 결과 없으면 빈 목록(404 아님, 목록 계약).
    """
    return medical_records_service.list_medical_records(appointment_id, patient_id)


@router.post("/medical-records/{record_id}/print", response_model=MedicalRecordOut)
def print_prescription(record_id: int) -> MedicalRecordOut:
    """처방전 출력(Story 3.3, AC3). 서버가 출력 시각(now())을 기록하고 갱신된 정규 모델을 반환(200).

    body 없음 — 시각은 SQL now() 가 소유한다(클라이언트 미신뢰). 없는 기록 404·처방 0건 400 은
    서비스가 소유한다(거부 경로에선 UPDATE 미호출). 출력이라는 "행위"라 POST(필드 수정 PATCH 아님).
    """
    return medical_records_service.print_prescription(record_id)
