"""참조 데이터 비즈니스 규칙 계층 (AD-2). db 계층을 호출하고 응답 모델로 매핑한다."""
from __future__ import annotations

from app.db import refdata as refdata_db
from app.schemas.refdata import DepartmentOut, DoctorOut, DrugOut


def list_departments() -> list[DepartmentOut]:
    """단일 병원의 진료과 목록을 정규 응답 모델로 돌려준다."""
    rows = refdata_db.fetch_departments()
    return [DepartmentOut(id=row["id"], name=row["name"]) for row in rows]


def list_drugs() -> list[DrugOut]:
    """약 목록을 정규 응답 모델로 돌려준다(Story 3.2 처방 드롭다운)."""
    rows = refdata_db.fetch_drugs()
    return [DrugOut(id=row["id"], name=row["name"], unit=row["unit"]) for row in rows]


def list_doctors(hospital_department_id: int | None) -> list[DoctorOut]:
    """의사 목록을 정규 응답 모델로 돌려준다(Story 2.1). 진료과 지정 시 그 과로 필터."""
    rows = refdata_db.fetch_doctors(hospital_department_id)
    return [
        DoctorOut(
            id=row["id"],
            name=row["name"],
            hospital_department_id=row["hospital_department_id"],
            department_name=row["department_name"],
        )
        for row in rows
    ]
