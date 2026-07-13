"""참조 데이터 라우터 — HTTP·검증만 (AD-2). 리소스 복수형 경로 (AD-10)."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.refdata import DepartmentOut
from app.services import refdata as refdata_service

router = APIRouter(tags=["refdata"])


@router.get("/departments", response_model=list[DepartmentOut])
def get_departments() -> list[DepartmentOut]:
    """단일 병원의 진료과 목록. 첫 화면이 이 엔드포인트로 수직 슬라이스를 관통한다(AC6)."""
    return refdata_service.list_departments()
