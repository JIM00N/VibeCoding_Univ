"""예약 DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row

from app.db.pool import get_pool

# 의사의 소속 진료과(hospital_department_id)를 조회한다 — 서비스가 "선택 의사가 선택 진료과 소속인지"
# 검증하는 데 쓴다. DB FK 는 의사 존재만 보장하고 소속 일치는 강제하지 않으므로 앱이 확인해야 한다.
_SELECT_DOCTOR_HD = """
    select hospital_department_id
    from public.doctor
    where id = %s
"""

# 예약 1건 삽입 후, 표시 필드(patient_name·doctor_name·department_name)를 조인해 한 왕복으로 돌려준다.
# - id 는 GENERATED ALWAYS AS IDENTITY 라 넣지 않는다(평범한 INSERT 가 다음 시퀀스 값 생성).
# - status 는 명시적 '대기'(AC1·DB 기본값과 일치, 자기문서화). reserved_at 은 서비스가 to_slot() 로 floor 한 값.
# - doctor 는 LEFT JOIN(doctor_id 스키마 nullable 정직; P0는 항상 채워짐).
# ⚠️ 슬롯 충돌 검사(check_and_occupy)는 Epic 5. P0는 검사 없이 삽입한다.
_INSERT_APPOINTMENT = """
    with inserted as (
        insert into public.appointment (patient_id, hospital_department_id, doctor_id, reserved_at, status)
        values (%s, %s, %s, %s, '대기')
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from inserted a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
"""


def fetch_doctor_department(doctor_id: int) -> int | None:
    """의사의 소속 진료과 id 를 반환한다. 의사가 없으면 None."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_DOCTOR_HD, (doctor_id,))
            row = cur.fetchone()
            return row["hospital_department_id"] if row else None


def insert_appointment(
    patient_id: int,
    hospital_department_id: int,
    doctor_id: int | None,
    reserved_at: datetime,
) -> dict[str, Any] | None:
    """예약 1건을 삽입하고 표시 필드까지 조인한 행(dict)을 반환한다. 파라미터화 SQL(injection 방지).

    FK 가 유효하면 조인 결과가 항상 1행이라 dict 를 돌려주지만, fetchone() 계약상 None 가능성을
    정직하게 반영한다(호출 서비스가 None 을 방어). FK 위반은 여기서 psycopg 예외로 올라간다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _INSERT_APPOINTMENT,
                (patient_id, hospital_department_id, doctor_id, reserved_at),
            )
            return cur.fetchone()
