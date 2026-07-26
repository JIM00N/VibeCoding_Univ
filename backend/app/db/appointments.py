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


# 직원 예약 목록(Story 2.2, FR-7). 2.1 _INSERT_APPOINTMENT 하단 조인과 같은 모양 → 같은 AppointmentOut
# shape 보장. doctor 는 LEFT JOIN(nullable 정직). 정렬 id desc = 방금 들어온 예약이 위(직원 확정 대상).
# 직원 전체 접근이라 patient_id 스코핑 없음(환자용 조회는 Epic 4).
_SELECT_APPOINTMENTS = """
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from public.appointment a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
    order by a.id desc
"""

# 환자용 예약 목록(Story 4.1, FR-11·AD-8) — _SELECT_APPOINTMENTS 의 표시 조인을 그대로 미러하고
# `where a.patient_id = %s` 로 그 환자만 필터한다(앱 레벨 필터, 보안 아님 — 데모 고지). 정렬은
# reserved_at desc = 최근 예약이 위(환자 관점 시간순 가독성; 직원 목록의 id desc 와 의도적으로 다름).
# 표시 조인 SQL 사본 규약: 기존 4사본과 같은 의도적 컨벤션 — 공유 fragment 추출은 deferred(지금 안 함).
_SELECT_APPOINTMENTS_BY_PATIENT = """
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from public.appointment a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
    where a.patient_id = %s
    order by a.reserved_at desc, a.id desc
"""

# 의사 대시보드 예약 목록(Story 6.1, FR-17·AD-8) — _SELECT_APPOINTMENTS_BY_PATIENT 의 표시 조인을
# 그대로 미러하고 `where a.doctor_id = %s` 로 그 의사에게 배정된 예약만 필터한다(앱 레벨 필터, 보안
# 아님 — 데모 고지). 활성/완료 분류는 프런트가 status 로 나눈다(신규 서버 필터 없음, FR-17). 정렬은
# reserved_at desc(환자용 목록과 동일 시간순 가독성). 표시 조인 SQL 사본 규약: 기존 5사본과 같은
# 의도적 컨벤션 — 공유 fragment 추출은 deferred(정리 스토리 몫).
_SELECT_APPOINTMENTS_BY_DOCTOR = """
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from public.appointment a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
    where a.doctor_id = %s
    order by a.reserved_at desc, a.id desc
"""

# 예약 단건 조회(상태 전이 전 현재 status·존재 확인용). 없으면 fetchone() 이 None → 서비스가 404.
_SELECT_APPOINTMENT_BY_ID = """
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from public.appointment a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
    where a.id = %s
"""

# 상태 전이(확정/취소) — UPDATE 후 표시 필드를 조인해 한 왕복으로 정규 모델을 돌려준다.
# 전이 적격성(대기→확정 등)은 서비스가 먼저 검증(AD-5). 추가로 UPDATE 자체가 `status = any(%s)`
# (허용 출발 status)를 조건으로 걸어 compare-and-set 한다 — 서비스 검증과 UPDATE 사이에 다른 요청이
# status 를 바꾸는 경합에서도 금지 전이(예: 취소→확정)가 성립하지 않는다. 조건 불일치는 0행 → None.
# ⚠️ 슬롯 점유/해제(check_and_occupy)는 Epic 5. 취소는 status 만 바꾼다(충돌 쿼리가 취소를 제외).
_UPDATE_APPOINTMENT_STATUS = """
    with updated as (
        update public.appointment
        set status = %s
        where id = %s
          and status = any(%s)
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from updated a
    join public.patient p               on p.id  = a.patient_id
    join public.hospital_department hd  on hd.id = a.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    left join public.doctor doc         on doc.id = a.doctor_id
"""


# 담당 의사 변경(Story 2.3, FR-7 P0) — doctor_id 만 UPDATE 하고 표시 필드를 조인해 한 왕복으로
# 정규 모델 행을 돌려준다. _UPDATE_APPOINTMENT_STATUS 와 같은 compare-and-set 모양:
# `status = any(%s)`(대기·확정)를 조건으로 걸어, 서비스 검증과 UPDATE 사이에 status 가 완료/취소로
# 바뀌는 경합에서도 부적격 예약의 재배정이 성립하지 않는다. 조건 불일치는 0행 → None(서비스가 409).
# status·reserved_at·hospital_department_id 는 건드리지 않는다(AD-5, 과 이동 없음).
# ⚠️ (의사, 슬롯) 가용성 재검사·exclude_appointment_id 는 Epic 5. P0는 doctor_id 갱신만.
_UPDATE_APPOINTMENT_DOCTOR = """
    with updated as (
        update public.appointment
        set doctor_id = %s
        where id = %s
          and status = any(%s)
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select a.id, a.patient_id, a.hospital_department_id, a.doctor_id, a.reserved_at, a.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from updated a
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


def fetch_appointments() -> list[dict[str, Any]]:
    """전체 예약 목록(dict 리스트)을 반환한다 — 직원 전체 접근(FR-7). 최신순(id desc)."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_APPOINTMENTS)
            return cur.fetchall()


def fetch_appointments_by_patient(patient_id: int) -> list[dict[str, Any]]:
    """한 환자의 예약 목록(dict 리스트)을 반환한다 — 환자용 조회(Story 4.1, FR-11·AD-8).

    필터드 목록이라 없으면 빈 리스트다(404 아님 — 목록 계약). 최근 예약순(reserved_at desc).
    파라미터화 SQL(injection 방지) — patient_id 는 %s 바인딩.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_APPOINTMENTS_BY_PATIENT, (patient_id,))
            return cur.fetchall()


def fetch_appointments_by_doctor(doctor_id: int) -> list[dict[str, Any]]:
    """한 의사에게 배정된 예약 목록(dict 리스트)을 반환한다 — 의사 대시보드(Story 6.1, FR-17·AD-8).

    필터드 목록이라 없으면 빈 리스트다(404 아님 — 목록 계약). 최근 예약순(reserved_at desc).
    활성(대기·확정)/완료 분류는 프런트가 한다(신규 서버 status 필터 없음). 파라미터화 SQL(injection 방지).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_APPOINTMENTS_BY_DOCTOR, (doctor_id,))
            return cur.fetchall()


def fetch_appointment(appointment_id: int) -> dict[str, Any] | None:
    """예약 1건(표시 필드 포함)을 반환한다. 없으면 None(서비스가 404 로 매핑)."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_APPOINTMENT_BY_ID, (appointment_id,))
            return cur.fetchone()


def update_appointment_status(
    appointment_id: int, new_status: str, allowed_sources: tuple[str, ...]
) -> dict[str, Any] | None:
    """예약 status 를 조건부(compare-and-set)로 갱신하고 표시 필드까지 조인한 행(dict)을 반환한다.

    현재 status 가 allowed_sources 안에 있을 때만 UPDATE 한다 — 서비스가 먼저 전이 적격성을
    검증하지만(AD-5), 검증과 UPDATE 사이에 다른 요청이 status 를 바꾸는 경합에서도 이 원자적 가드가
    금지 전이를 막는다. 조건 불일치(경합)·없는 id 는 0행 → None(서비스가 409 로 매핑).
    파라미터화 SQL(injection 방지) — allowed_sources 는 text[] 배열 파라미터로 바인딩된다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _UPDATE_APPOINTMENT_STATUS,
                (new_status, appointment_id, list(allowed_sources)),
            )
            return cur.fetchone()


def update_appointment_doctor(
    appointment_id: int, doctor_id: int, allowed_sources: tuple[str, ...]
) -> dict[str, Any] | None:
    """예약의 담당 의사를 조건부(compare-and-set)로 갱신하고 표시 필드까지 조인한 행을 반환한다.

    현재 status 가 allowed_sources(대기·확정) 안에 있을 때만 UPDATE 한다 — 서비스가 먼저 적격성을
    검증하지만, 검증과 UPDATE 사이에 status 가 바뀌는 경합에서도 이 원자적 가드가 부적격 재배정을
    막는다. 조건 불일치(경합)·없는 id 는 0행 → None(서비스가 409 로 매핑).
    파라미터화 SQL(injection 방지) — placeholder 순서는 SQL 대로 (doctor_id, appointment_id, sources).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _UPDATE_APPOINTMENT_DOCTOR,
                (doctor_id, appointment_id, list(allowed_sources)),
            )
            return cur.fetchone()
