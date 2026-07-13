"""참조 데이터(진료과 등) DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from typing import Any

from psycopg.rows import dict_row

from app.db.pool import get_pool

# 진료과 목록 = 단일 병원의 hospital_department 행 + department 이름.
# id 는 hospital_department.id 를 돌려준다 — appointment.hospital_department_id 가
# 참조하는 값이라, 예약(FR-6)이 이 id 를 그대로 저장하면 FK 가 맞는다. (AD-6, review-datamodel 매핑)
# raw department.id 를 돌려주면 예약 FK 가 깨지므로 절대 금지.
_SELECT_DEPARTMENTS = """
    select hd.id as id, d.name as name
    from public.hospital_department hd
    join public.department d on d.id = hd.department_id
    order by hd.id
"""


def fetch_departments() -> list[dict[str, Any]]:
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_DEPARTMENTS)
            return cur.fetchall()
