"""참조 데이터 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.refdata import DepartmentOut, DoctorOut, DrugOut
from app.services import refdata as refdata_service

router = APIRouter(tags=["refdata"])


@router.get("/departments", response_model=list[DepartmentOut])
def get_departments() -> list[DepartmentOut]:
    """단일 병원의 진료과 목록. 첫 화면이 이 엔드포인트로 수직 슬라이스를 관통한다(AC6)."""
    return refdata_service.list_departments()


@router.get("/drugs", response_model=list[DrugOut])
def get_drugs() -> list[DrugOut]:
    """약 목록(Story 3.2, FR-10). 진료 기록 폼의 처방 행 약 드롭다운을 채운다(시드 전용)."""
    return refdata_service.list_drugs()


@router.get("/doctors", response_model=list[DoctorOut])
def get_doctors(hospital_department_id: int | None = None) -> list[DoctorOut]:
    """의사 목록(Story 2.1, FR-6). ?hospital_department_id= 있으면 그 진료과 의사만, 없으면 전체.

    예약 화면이 진료과를 고른 뒤 담당 의사 드롭다운을 채우는 데 쓴다(직접 선택, P0).
    """
    return refdata_service.list_doctors(hospital_department_id)
