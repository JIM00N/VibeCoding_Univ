"""예약 DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row

from app.db.availability import (
    NoFreeDoctorError,
    SlotTakenError,
    free_doctor_sql,
    slot_taken_sql,
)
from app.db.pool import get_pool

# 의사의 소속 진료과(hospital_department_id)를 조회한다 — 서비스가 "선택 의사가 선택 진료과 소속인지"
# 검증하는 데 쓴다. DB FK 는 의사 존재만 보장하고 소속 일치는 강제하지 않으므로 앱이 확인해야 한다.
_SELECT_DOCTOR_HD = """
    select hospital_department_id
    from public.doctor
    where id = %s
"""

# 예약 1건을 충돌 게이트와 함께 삽입하고(Story 5.1, FR-15·AD-4), 표시 필드까지 한 왕복으로 돌려준다.
# - taken CTE 가 (의사, 슬롯) 점유를 판정하고, INSERT 는 `where not slot_taken` 으로 게이트된다 —
#   검사+삽입이 같은 SQL 문이라 한 문장 안에서는 검사↔삽입 사이에 끼어들 틈이 없다(단일 CTE 관용구).
#   ⚠️ 이는 **단일 세션 전제**의 보장이다 — 동시에 실행되는 다른 문장의 미커밋 삽입은 스냅샷에 안
#   보이므로 동시 요청 경쟁(TOCTOU)은 막지 못한다(명시적 범위 밖 — 아키텍처 Deferred, AD-4 강제 경계).
#   충돌 조각·floor 식은 db/availability.py 한 벌뿐(AD-3). 슬롯 = %(reserved_at)s (서비스가
#   to_slot() 로 floor 한 값이지만, 비교 양변에 floor 식을 재적용해 저장 형태에 의존하지 않는다).
# - id 는 GENERATED ALWAYS AS IDENTITY 라 넣지 않는다. status 는 명시적 '대기'(자기문서화).
# - 최종 SELECT 는 taken 기준 LEFT JOIN — 충돌 시 inserted 가 0행이어도 slot_taken 플래그 1행을
#   돌려준다(함수가 SlotTakenError 로 변환). 성공 시 FK 가 유효해 표시 조인은 항상 채워진다.
# - named 파라미터(%(name)s) — 게이트 조각이 named 라 문 전체를 통일(혼용 금지).
_INSERT_APPOINTMENT = f"""
    with taken as (
        select {slot_taken_sql("%(reserved_at)s")} as slot_taken
    ),
    inserted as (
        insert into public.appointment (patient_id, hospital_department_id, doctor_id, reserved_at, status)
        select %(patient_id)s, %(hospital_department_id)s, %(doctor_id)s, %(reserved_at)s, '대기'
        from taken
        where not slot_taken
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select t.slot_taken,
           i.id, i.patient_id, i.hospital_department_id, i.doctor_id, i.reserved_at, i.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from taken t
    left join inserted i                    on true
    left join public.patient p              on p.id  = i.patient_id
    left join public.hospital_department hd on hd.id = i.hospital_department_id
    left join public.department d           on d.id  = hd.department_id
    left join public.doctor doc             on doc.id = i.doctor_id
"""


# 자동 배정 삽입(Story 5.2, FR-6 P1·AD-4) — 빈 의사 pick 과 INSERT 가 같은 SQL 문이다.
# free_doctor CTE(조각은 db/availability.py 한 벌)가 진료과 의사 중 그 슬롯이 빈 의사를
# id 오름차순 1명 고르고, INSERT 는 그 결과 행에서만 select 하므로 전원 점유면 0행이다 —
# pick 이 곧 충돌 검사라 별도 taken 게이트가 없다(같은 문 안 = 단일 세션 원자, TOCTOU 는
# _INSERT_APPOINTMENT 와 동일하게 범위 밖). CTE 는 다중 참조라 materialize 1회 — inserted 와
# 최종 select 의 free_found 가 같은 pick 결과를 본다.
# 최종 SELECT 는 free_found 플래그 1행을 항상 돌려준다(전원 점유 시 NoFreeDoctorError 로 변환).
# 표시 조인은 _INSERT_APPOINTMENT 미러(표시 조인 사본 6번째 — 의도적 컨벤션, 추출은 deferred).
_INSERT_APPOINTMENT_AUTO = f"""
    with free_doctor as (
        select fd.id
        from {free_doctor_sql("%(reserved_at)s")} fd
    ),
    inserted as (
        insert into public.appointment (patient_id, hospital_department_id, doctor_id, reserved_at, status)
        select %(patient_id)s, %(hospital_department_id)s, fd.id, %(reserved_at)s, '대기'
        from free_doctor fd
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select exists (select 1 from free_doctor) as free_found,
           i.id, i.patient_id, i.hospital_department_id, i.doctor_id, i.reserved_at, i.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from (select 1) one
    left join inserted i                    on true
    left join public.patient p              on p.id  = i.patient_id
    left join public.hospital_department hd on hd.id = i.hospital_department_id
    left join public.department d           on d.id  = hd.department_id
    left join public.doctor doc             on doc.id = i.doctor_id
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
# 슬롯 점유/해제 로직 불필요 — 취소는 status 만 바꾸면 충돌 쿼리(db/availability.py)가 취소를 제외한다.
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


# 예약 일정 변경(Story 7.1, FR-19 — Story 2.3 의 _UPDATE_APPOINTMENT_DOCTOR 를 대체).
# doctor_id·reserved_at 두 컬럼을 UPDATE 하고 표시 필드를 조인해 한 왕복으로 돌려준다.
# 세 겹의 원자 가드가 이 행에 걸린다(둘은 이 문 안, 하나는 DB 인덱스):
# ① compare-and-set: `status = any(%(allowed_sources)s)`(대기·확정) — 검증과 UPDATE 사이 status
#    경합에서도 부적격 변경이 성립하지 않는다. 불일치 0행 → id null 행 → None(서비스가 CAS 409).
# ② 의사 축 가용성 재검사(FR-15·AD-4): 새 (의사, 슬롯) 점유를 taken CTE 가 판정하고
#    `not slot_taken` 으로 게이트한다. 자기 행은 %(exclude_appointment_id)s 로 제외한다 —
#    없으면 "시각 유지 + 의사만 변경"이 자기 자신과 충돌한다.
#    ⚠️ 슬롯 식이 2.3 과 다르다: 2.3 은 reserved_at 을 안 바꿔 대상 행에서 유도했지만
#    (`(select reserved_at from target)`), 7.1 은 **요청된 새 시각**(%(reserved_at)s)으로
#    판정해야 한다 — 대상 행에서 유도하면 옛 시각의 충돌만 보고 새 시각을 검사하지 않는다.
#    이전 슬롯 해제 + 새 슬롯 점유는 두 컬럼 단일 UPDATE 로 원자 성립한다.
# ③ 환자 축(FR-15b)은 이 문에 없다 — 006 부분 유니크 인덱스가 UPDATE 에서 자동 발동해
#    UniqueViolation 을 올린다(서비스가 _reject_unique_violation 으로 409 매핑).
# target CTE 는 cas_ok 판정용으로 남는다(더 이상 reserved_at 을 유도하지 않는다).
# status·hospital_department_id 는 건드리지 않는다(AD-5, 과 이동 없음).
_UPDATE_APPOINTMENT_SCHEDULE = f"""
    with target as (
        select status = any(%(allowed_sources)s) as cas_ok
        from public.appointment
        where id = %(appointment_id)s
    ),
    taken as (
        select {slot_taken_sql("%(reserved_at)s")} as slot_taken
    ),
    updated as (
        update public.appointment
        set doctor_id = %(doctor_id)s,
            reserved_at = %(reserved_at)s
        where id = %(appointment_id)s
          and status = any(%(allowed_sources)s)
          and not (select slot_taken from taken)
        returning id, patient_id, hospital_department_id, doctor_id, reserved_at, status
    )
    select t.slot_taken,
           (select cas_ok from target) as cas_ok,
           u.id, u.patient_id, u.hospital_department_id, u.doctor_id, u.reserved_at, u.status,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
    from taken t
    left join updated u                     on true
    left join public.patient p              on p.id  = u.patient_id
    left join public.hospital_department hd on hd.id = u.hospital_department_id
    left join public.department d           on d.id  = hd.department_id
    left join public.doctor doc             on doc.id = u.doctor_id
"""


def _interpret_schedule_update_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """일정 변경 게이트 문의 결과 행 해석(순수 함수 — 직접 단위 테스트 대상).

    CAS 불일치(cas_ok=false)가 슬롯 충돌보다 **우선**한다(코드리뷰) — 이중 경합에서 슬롯 409 의
    "다른 의사를 선택해 주세요"는 따라도 성공할 수 없는 오도 안내가 되기 때문. 진짜 사유(status
    변경)는 None → CAS 409 경로가 안내한다. 행 자체가 없으면(없는 id) 역시 None.
    """
    if row is None:
        return None  # fetchone 계약상 가능성 정직 반영(taken CTE 가 항상 1행이라 도달 불가).
    slot_taken = row.pop("slot_taken")
    cas_ok = row.pop("cas_ok")
    if row["id"] is None:
        if slot_taken and cas_ok:
            raise SlotTakenError()
        return None  # CAS 불일치·없는 id — 기존 None 계약 유지(서비스가 409/404 소유).
    return row


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
    """예약 1건을 충돌 게이트와 함께 삽입하고 표시 필드까지 조인한 행(dict)을 반환한다.

    (의사, 슬롯) 이 이미 점유돼 게이트가 삽입을 거부하면 SlotTakenError 를 올린다(서비스가
    409 로 매핑). 반환 계약은 기존 그대로 "행 dict | None" — slot_taken 플래그는 여기서
    해석·제거한다. FK 위반은 psycopg 예외로 올라간다. 파라미터화 SQL(injection 방지).
    """
    if doctor_id is None:
        # 게이트 조각의 `a.doctor_id = NULL` 비교는 항상 no-match 라 충돌 검사가 통째로 무력화된다.
        # P0 서비스가 400으로 먼저 막지만, 5.2(자동 배정) 등 후속 직접 호출자를 위해 db 계층에서도
        # 명시 거부한다(코드리뷰 — 커넥션을 열기 전에 실패해 테스트도 DB 없이 가능).
        raise ValueError("insert_appointment: doctor_id 없이는 충돌 게이트가 성립하지 않아요.")
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _INSERT_APPOINTMENT,
                {
                    "patient_id": patient_id,
                    "hospital_department_id": hospital_department_id,
                    "doctor_id": doctor_id,
                    "reserved_at": reserved_at,
                    # 생성은 자기 행이 없다 — 조각을 한 벌로 유지하기 위한 nullable 파라미터.
                    "exclude_appointment_id": None,
                },
            )
            row = cur.fetchone()
    if row is None:
        return None  # fetchone 계약상 가능성 정직 반영(도달 불가) — 서비스 500 방어 유지.
    if row.pop("slot_taken"):
        raise SlotTakenError()
    if row["id"] is None:
        return None  # 게이트 통과 후 삽입 0행 — 도달 불가, 방어적 가드.
    return row


def _interpret_auto_insert_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """자동 배정 문의 결과 행 해석(순수 함수 — 직접 단위 테스트 대상, _interpret_schedule_update_row 미러).

    free_found=false → 진료과 전 의사 점유(또는 빈 과 — 서비스 선검증이 구분) → NoFreeDoctorError.
    """
    if row is None:
        return None  # fetchone 계약상 가능성 정직 반영(최종 select 가 항상 1행이라 도달 불가).
    if not row.pop("free_found"):
        raise NoFreeDoctorError()
    if row["id"] is None:
        return None  # pick 성공 후 삽입 0행 — 도달 불가, 방어적 가드(서비스 500 방어 유지).
    return row


def insert_appointment_auto(
    patient_id: int,
    hospital_department_id: int,
    reserved_at: datetime,
) -> dict[str, Any] | None:
    """의사 미선택 예약을 자동 배정으로 삽입하고 표시 필드까지 조인한 행(dict)을 반환한다(Story 5.2).

    진료과 의사 중 그 슬롯이 빈 의사를 id 오름차순 1명 골라 같은 문 안에서 삽입한다 — pick 이
    곧 충돌 검사다. 전원 점유면 NoFreeDoctorError(서비스가 409 로 매핑). 진료과에 의사가 아예
    없어도 같은 예외가 되므로 서비스가 선검증으로 400 을 구분한다. FK 위반(없는 환자)은 psycopg
    예외로 올라간다. 반환 계약은 insert_appointment 와 동일한 "행 dict | None". 파라미터화 SQL.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _INSERT_APPOINTMENT_AUTO,
                {
                    "patient_id": patient_id,
                    "hospital_department_id": hospital_department_id,
                    "reserved_at": reserved_at,
                    # 생성은 자기 행이 없다 — 조각을 한 벌로 유지하기 위한 nullable 파라미터.
                    "exclude_appointment_id": None,
                },
            )
            row = cur.fetchone()
    return _interpret_auto_insert_row(row)


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


def update_appointment_schedule(
    appointment_id: int,
    doctor_id: int,
    reserved_at: datetime,
    allowed_sources: tuple[str, ...],
) -> dict[str, Any] | None:
    """예약의 담당 의사·진료 시각을 CAS + 가용성 재검사로 갱신하고 표시 필드까지 조인해 반환한다.

    호출자(서비스)는 **항상 두 값을 모두** 넘긴다 — 미지정 필드는 서비스가 현재 값으로 합성하므로
    여기엔 분기가 없다(같은 값을 다시 써도 무해).

    새 (의사, 슬롯)이 이미 점유돼 있으면(자기 행 제외) SlotTakenError 를 올린다(서비스가 409 슬롯
    문구로 매핑). 그 환자가 새 슬롯에 이미 다른 활성 예약을 갖고 있으면 006 부분 유니크 인덱스가
    UniqueViolation 을 올린다(서비스가 환자 축 409 로 매핑 — 이 문에는 그 조건이 없다).
    status 경합(CAS 불일치)·없는 id 는 None(서비스가 CAS 409 로 매핑) — 세 409 는 문구로 구분된다.
    파라미터화 SQL(injection 방지).
    """
    if doctor_id is None:
        # insert_appointment 와 같은 이유의 형제 가드(코드리뷰): 게이트 조각의 `a.doctor_id = NULL`
        # 비교는 항상 no-match 라 slot_taken 이 영구 false 가 되고, 충돌 검사가 통째로 무력화된 채
        # 이미 찬 슬롯으로 이동이 통과한다. appointment.doctor_id 는 스키마상 nullable 이므로
        # (앱이 항상 채우지만 DB 는 허용) db 계층에서도 명시 거부한다 — 커넥션을 열기 전에 실패해
        # 테스트도 DB 없이 가능하다.
        raise ValueError("update_appointment_schedule: doctor_id 없이는 충돌 게이트가 성립하지 않아요.")
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _UPDATE_APPOINTMENT_SCHEDULE,
                {
                    "appointment_id": appointment_id,
                    "doctor_id": doctor_id,
                    "reserved_at": reserved_at,
                    "allowed_sources": list(allowed_sources),
                    "exclude_appointment_id": appointment_id,
                },
            )
            row = cur.fetchone()
    return _interpret_schedule_update_row(row)
