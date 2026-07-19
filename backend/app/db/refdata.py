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


# 의사 목록 (Story 2.1, FR-6). doctor ⋈ hospital_department ⋈ department 로 소속·표시 필드를 싣는다.
# hospital_department_id 는 doctor 의 소속(FK) — 예약이 이 값을 진료과와 대조한다.
# 예약 화면은 진료과 선택 후 ?hospital_department_id= 로 그 과 의사만 받는다(없으면 전체, 단일 병원).
_SELECT_DOCTORS = """
    select doc.id as id,
           doc.name as name,
           doc.hospital_department_id as hospital_department_id,
           d.name as department_name
    from public.doctor doc
    join public.hospital_department hd on hd.id = doc.hospital_department_id
    join public.department d on d.id = hd.department_id
    order by doc.name, doc.id
"""
_SELECT_DOCTORS_BY_HD = """
    select doc.id as id,
           doc.name as name,
           doc.hospital_department_id as hospital_department_id,
           d.name as department_name
    from public.doctor doc
    join public.hospital_department hd on hd.id = doc.hospital_department_id
    join public.department d on d.id = hd.department_id
    where doc.hospital_department_id = %s
    order by doc.name, doc.id
"""


def fetch_doctors(hospital_department_id: int | None = None) -> list[dict[str, Any]]:
    """의사 목록(dict 리스트)을 반환한다. hospital_department_id 있으면 그 진료과로 필터.

    필터값은 서비스가 넘긴다(이 계층은 SQL I/O 만). 파라미터화 SQL(injection 방지).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if hospital_department_id is not None:
                cur.execute(_SELECT_DOCTORS_BY_HD, (hospital_department_id,))
            else:
                cur.execute(_SELECT_DOCTORS)
            return cur.fetchall()
