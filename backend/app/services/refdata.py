"""참조 데이터 비즈니스 규칙 계층 (AD-2). db 계층을 호출하고 응답 모델로 매핑한다."""
from __future__ import annotations

from app.db import refdata as refdata_db
from app.schemas.refdata import DepartmentOut


def list_departments() -> list[DepartmentOut]:
    """단일 병원의 진료과 목록을 정규 응답 모델로 돌려준다."""
    rows = refdata_db.fetch_departments()
    return [DepartmentOut(id=row["id"], name=row["name"]) for row in rows]
