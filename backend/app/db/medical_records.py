"""진료 기록 DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.db.pool import get_pool

# 진료 기록 생성 + 예약 완료 전이(Story 3.1, FR-8·FR-9) — 이 프로젝트 첫 다중 쓰기 트랜잭션.
# 두 쓰기를 "단일 CTE 문"으로 합성해 문장 원자성으로 해결한다(Epic 2 회고 액션 #4 —
# 단일 db 함수·한 커넥션·한 tx. 서비스가 두 db 호출로 쪼개면 커넥션이 달라 원자성이 깨진다):
#   1) completed: 확정 예약만 완료로 UPDATE (compare-and-set — 검증과 쓰기 사이 status 경합 차단).
#      `doctor_id is not null` 도 조건에 포함 — 검증과 쓰기 사이에 doctor_id 가 null 로 바뀌는
#      경합(의사 행 삭제의 FK SET NULL 등)이 NOT NULL 삽입 500 으로 새지 않고 0행 → 409 로 수렴.
#      0행이면 inserted 도 0행 → fetchone() None(아무것도 안 씀, 서비스가 409).
#   2) inserted: 예약 행에서 patient_id·hospital_department_id·doctor_id 를 그 순간 값으로 복사해
#      INSERT (AD-6 스냅샷 — 클라이언트 값도, 별도 fetch 값도 신뢰하지 않아 경합 여지 자체가 없다).
#      부분 유니크(uq_medical_record_appointment) 위반은 UniqueViolation 으로 올라가고, 한 문장이라
#      완료 전이도 함께 롤백된다(기록 없이 완료되는 예약 없음, AC4).
#   3) rx(Story 3.2): 처방 0..N 을 같은 문장에서 INSERT — jsonb_to_recordset 이 입력 배열을 행으로
#      풀고 inserted 와 cross join 한다. CAS 0행이면 inserted 0행 → rx 도 0행(아무것도 안 씀).
#      처방 0개면 '[]' → 0행 — 별도 분기 불필요. 없는 drug_id 는 ForeignKeyViolation 으로 올라가고
#      한 문장이라 기록·완료 전이·다른 처방이 전부 함께 롤백된다(처방만 빠진 기록이 불가능, AC2).
#   4) 최종 SELECT: 표시 필드(patient_name·doctor_name·department_name)를 조인해 한 왕복으로 반환.
#      doctor 는 INNER JOIN — medical_record.doctor_id 는 NOT NULL(appointments 의 LEFT 와 다름).
#      prescriptions 는 rx ⋈ drug 를 jsonb_agg 로 집계(입력 순서 = identity 순서 = order by r.id).
#      ⚠️ 경계: fetchone() None 은 서비스가 전부 CAS 0행(409)으로 해석한다. 최종 SELECT 의 INNER
#      JOIN 미스도 이론상 None 을 만들 수 있으나(이 경우 쓰기는 커밋됨), 현 스키마(복사 컬럼 NOT
#      NULL + FK RESTRICT/CASCADE)에선 도달 불가. NOT NULL 완화·조인 필터(soft delete 등) 도입
#      마이그레이션 시 두 0행 원인을 구분할 것.
# ⚠️ 슬롯 점유(check_and_occupy)는 Epic 5 — 예약 기반 기록은 슬롯을 새로 점유하지 않는다(완료=과거).
_INSERT_RECORD_AND_COMPLETE = """
    with completed as (
        update public.appointment
        set status = '완료'
        where id = %s
          and status = '확정'
          and doctor_id is not null
        returning id, patient_id, hospital_department_id, doctor_id
    ),
    inserted as (
        insert into public.medical_record
            (appointment_id, patient_id, hospital_department_id, doctor_id,
             visited_at, diagnosis, notes)
        select c.id, c.patient_id, c.hospital_department_id, c.doctor_id,
               %s, %s, %s
        from completed c
        returning id, appointment_id, patient_id, hospital_department_id,
                  doctor_id, visited_at, diagnosis, notes, prescription_printed_at
    ),
    rx as (
        insert into public.prescription (medical_record_id, drug_id, dosage, days)
        select i.id, x.drug_id, x.dosage, x.days
        from inserted i
        cross join jsonb_to_recordset(%s) as x(drug_id bigint, dosage text, days int)
        returning id, drug_id, dosage, days
    )
    select i.id, i.appointment_id, i.patient_id, i.hospital_department_id,
           i.doctor_id, i.visited_at, i.diagnosis, i.notes,
           i.prescription_printed_at,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name,
           coalesce(
               (select jsonb_agg(jsonb_build_object(
                    'id', r.id, 'drug_id', r.drug_id, 'drug_name', dr.name,
                    'dosage', r.dosage, 'days', r.days) order by r.id)
                from rx r join public.drug dr on dr.id = r.drug_id),
               '[]'::jsonb) as prescriptions
    from inserted i
    join public.patient p               on p.id  = i.patient_id
    join public.hospital_department hd  on hd.id = i.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    join public.doctor doc              on doc.id = i.doctor_id
"""


def insert_medical_record_and_complete(
    appointment_id: int,
    visited_at: datetime,
    diagnosis: str,
    notes: str | None,
    prescriptions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """진료 기록 1건 + 처방 0..N 을 만들고 같은 문장에서 그 예약을 확정→완료로 전이한다(AD-5).

    스냅샷 3필드(patient/hd/doctor)는 인자로 받지 않는다 — SQL 이 예약 행에서 복사한다(AD-6).
    예약이 더 이상 확정이 아니면(경합) 0행 → None(서비스가 409). 부분 유니크 위반(예약당 기록
    1건)은 UniqueViolation, 없는 drug_id 는 ForeignKeyViolation 으로 올라간다(서비스가 4xx 매핑,
    한 문장이라 어느 쪽이든 전부 함께 롤백됨).
    파라미터화 SQL(injection 방지) — placeholder 순서는 SQL 대로 (appointment_id, visited_at,
    diagnosis, notes, prescriptions). prescriptions 는 dict 리스트를 Jsonb 어댑터로 jsonb 바인딩
    하고, 응답의 prescriptions 집계는 psycopg 가 파이썬 리스트로 파싱해 돌려준다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _INSERT_RECORD_AND_COMPLETE,
                (appointment_id, visited_at, diagnosis, notes, Jsonb(prescriptions)),
            )
            return cur.fetchone()


# ── 조회 2종 (Story 3.3, FR-10 확장) ────────────────────────────────────────
# 3.2 CTE 최종 SELECT 의 투영을 독립 SELECT 로 미러한다 — 응답 모양의 단일 진실(같은 표시 조인 +
# prescription_printed_at + 처방 jsonb 집계). 두 사본(appointment 기준·id 기준)은 where 절만 다르다.
# refdata `_SELECT_DOCTORS`/`_SELECT_DOCTORS_BY_HD` 컨벤션 준수 — 공유 fragment 추출(표시 조인 SQL
# 사본)은 기존 deferred-work 에 합류(지금 정리하지 않는다).

_SELECT_RECORDS_BY_APPOINTMENT = """
    select mr.id, mr.appointment_id, mr.patient_id, mr.hospital_department_id,
           mr.doctor_id, mr.visited_at, mr.diagnosis, mr.notes,
           mr.prescription_printed_at,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name,
           coalesce(
               (select jsonb_agg(jsonb_build_object(
                    'id', pr.id, 'drug_id', pr.drug_id, 'drug_name', dr.name,
                    'dosage', pr.dosage, 'days', pr.days) order by pr.id)
                from public.prescription pr
                join public.drug dr on dr.id = pr.drug_id
                where pr.medical_record_id = mr.id),
               '[]'::jsonb) as prescriptions
    from public.medical_record mr
    join public.patient p               on p.id  = mr.patient_id
    join public.hospital_department hd  on hd.id = mr.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    join public.doctor doc              on doc.id = mr.doctor_id
    where mr.appointment_id = %s
    order by mr.id
"""

_SELECT_RECORD_BY_ID = """
    select mr.id, mr.appointment_id, mr.patient_id, mr.hospital_department_id,
           mr.doctor_id, mr.visited_at, mr.diagnosis, mr.notes,
           mr.prescription_printed_at,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name,
           coalesce(
               (select jsonb_agg(jsonb_build_object(
                    'id', pr.id, 'drug_id', pr.drug_id, 'drug_name', dr.name,
                    'dosage', pr.dosage, 'days', pr.days) order by pr.id)
                from public.prescription pr
                join public.drug dr on dr.id = pr.drug_id
                where pr.medical_record_id = mr.id),
               '[]'::jsonb) as prescriptions
    from public.medical_record mr
    join public.patient p               on p.id  = mr.patient_id
    join public.hospital_department hd  on hd.id = mr.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    join public.doctor doc              on doc.id = mr.doctor_id
    where mr.id = %s
"""


def fetch_medical_records_by_appointment(appointment_id: int) -> list[dict[str, Any]]:
    """예약에 속한 진료 기록·처방을 정규 응답 투영으로 반환(0..1행 — 예약당 기록 1건, AC4).

    필터드 목록이라 없으면 빈 리스트다(404 아님 — patients/appointments 목록 계약 미러).
    파라미터화 SQL(injection 방지). jsonb 집계는 psycopg 가 list[dict] 로 파싱해 준다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_RECORDS_BY_APPOINTMENT, (appointment_id,))
            return cur.fetchall()


def fetch_medical_record(record_id: int) -> dict[str, Any] | None:
    """진료 기록 1건을 정규 응답 투영으로 반환(print 가드용). 없으면 None."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_SELECT_RECORD_BY_ID, (record_id,))
            return cur.fetchone()


# ── 처방전 출력 도장 (Story 3.3, AC3·AC4) ──────────────────────────────────
# UPDATE 가 시각을 소유한다 — set prescription_printed_at = now(). 클라이언트·서비스가 시각을 보내지
# 않고, 이 문장의 SQL now() 가 단일 소스다(AD-6 "클라이언트 미신뢰" 정신). CTE 로 UPDATE 뒤 표시
# 조인·처방 집계를 붙여 갱신된 정규 행을 한 왕복으로 반환한다(조회 투영과 같은 모양).
# ⚠️ 3.1 처럼 CAS 가 없는 이유: 기록·처방엔 삭제/수정 API 가 없어 검증(fetch)과 UPDATE 사이에 상태가
# 바뀔 경로가 없고, printed_at 덮어쓰기는 멱등이다(두 번 눌러도 최신 시각). 3.1 의 CAS 는 status 전이
# 경합용 — 여기 복제하지 말 것. 시각 인자를 받지 않는 시그니처가 계약이다.
_MARK_PRESCRIPTION_PRINTED = """
    with updated as (
        update public.medical_record
        set prescription_printed_at = now()
        where id = %s
        returning id, appointment_id, patient_id, hospital_department_id,
                  doctor_id, visited_at, diagnosis, notes, prescription_printed_at
    )
    select u.id, u.appointment_id, u.patient_id, u.hospital_department_id,
           u.doctor_id, u.visited_at, u.diagnosis, u.notes,
           u.prescription_printed_at,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name,
           coalesce(
               (select jsonb_agg(jsonb_build_object(
                    'id', pr.id, 'drug_id', pr.drug_id, 'drug_name', dr.name,
                    'dosage', pr.dosage, 'days', pr.days) order by pr.id)
                from public.prescription pr
                join public.drug dr on dr.id = pr.drug_id
                where pr.medical_record_id = u.id),
               '[]'::jsonb) as prescriptions
    from updated u
    join public.patient p               on p.id  = u.patient_id
    join public.hospital_department hd  on hd.id = u.hospital_department_id
    join public.department d            on d.id  = hd.department_id
    join public.doctor doc              on doc.id = u.doctor_id
"""


def mark_prescription_printed(record_id: int) -> dict[str, Any] | None:
    """처방전 출력 시각을 now() 로 기록하고 갱신된 정규 행을 반환한다. 없는 기록이면 0행 → None.

    시각 인자를 받지 않는다(계약) — SQL now() 가 시각의 단일 소스다(서버 미신뢰 원칙).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_MARK_PRESCRIPTION_PRINTED, (record_id,))
            return cur.fetchone()
