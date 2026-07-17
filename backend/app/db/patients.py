"""환자 DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from datetime import date
from typing import Any

from psycopg.rows import dict_row

from app.db.pool import get_pool

# id 는 GENERATED ALWAYS AS IDENTITY 라 넣지 않는다 — 평범한 INSERT 가 다음 시퀀스 값을 생성한다.
# (시드가 setval 로 시퀀스를 max(id)에 맞춰둬 PK 충돌 없음.) OVERRIDING SYSTEM VALUE 는 시드 전용.
# RETURNING 으로 생성된 행을 그대로 돌려받아 서비스가 정규 모델로 매핑한다.
_INSERT_PATIENT = """
    insert into public.patient (name, birth_date, gender, phone)
    values (%s, %s, %s, %s)
    returning id, name, birth_date, gender, phone
"""

# 목록/검색 조회 (Story 1.4, FR-5). POST 와 같은 컬럼을 골라 서비스가 동일한 PatientOut 으로 매핑(AD-10).
# 직원이 이름으로 훑기 좋게 name 정렬(동명이인은 id 로 tie-break). 직원 전체 접근이라 patient_id 스코핑 없음.
_SELECT_PATIENTS = """
    select id, name, birth_date, gender, phone
    from public.patient
    order by name, id
"""

# 이름 부분 일치. ILIKE 로 대소문자 무관(한글엔 대소문자 없어 LIKE 와 동일, 라틴 문자엔 무관 검색).
# ⚠️ 반드시 파라미터화(%s) — 검색어를 SQL 문자열에 직접 끼워 넣으면 injection. 값은 f"%{...}%" 로만 조립.
_SELECT_PATIENTS_BY_NAME = """
    select id, name, birth_date, gender, phone
    from public.patient
    where name ilike %s
    order by name, id
"""


def insert_patient(
    name: str,
    birth_date: date | None,
    gender: str | None,
    phone: str | None,
) -> dict[str, Any]:
    """신규 환자 1건을 삽입하고 생성된 행(dict)을 반환한다. 파라미터화 SQL(injection 방지)."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_INSERT_PATIENT, (name, birth_date, gender, phone))
            return cur.fetchone()


def _escape_like(term: str) -> str:
    r"""LIKE/ILIKE 메타문자(\ % _)를 이스케이프한다. 백슬래시는 Postgres LIKE 의 기본 escape 문자.

    파라미터화라 injection 은 없지만, 이스케이프 안 하면 '%' 검색이 전체 환자를, '_' 가 임의 한 글자를
    매칭해 오검색이 난다(리터럴 '%'·'_' 가 든 이름도 못 찾음). 백슬래시를 먼저 이스케이프해야
    뒤에서 넣는 이스케이프가 이중 처리되지 않는다.
    """
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def fetch_patients(search: str | None = None) -> list[dict[str, Any]]:
    """환자 목록(dict 리스트)을 반환한다. search 가 있으면 이름 부분 일치로 필터.

    search 는 서비스가 미리 trim·빈값→None 으로 정규화해 넘긴다(이 계층은 SQL I/O 만).
    파라미터화 SQL 로 injection 을 막고, 검색어의 LIKE 메타문자는 _escape_like 로 리터럴화한다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if search:
                cur.execute(_SELECT_PATIENTS_BY_NAME, (f"%{_escape_like(search)}%",))
            else:
                cur.execute(_SELECT_PATIENTS)
            return cur.fetchall()
