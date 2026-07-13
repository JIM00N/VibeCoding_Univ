"""참조 데이터 응답 모델. 리소스당 정규 모델 1개, 모든 엔드포인트 동일 모양 (AD-10)."""
from __future__ import annotations

from pydantic import BaseModel


class DepartmentOut(BaseModel):
    """진료과. id = hospital_department.id(정수), name = department.name.

    연관은 FK 정수 id + 평평한 표시 필드로 싣는다(nested 금지, AD-10).
    """

    id: int
    name: str
