"""진료 기록 DB I/O. db 계층 — 유일한 DB 접근 지점 (AD-2)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row

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
#   3) 최종 SELECT: 표시 필드(patient_name·doctor_name·department_name)를 조인해 한 왕복으로 반환.
#      doctor 는 INNER JOIN — medical_record.doctor_id 는 NOT NULL(appointments 의 LEFT 와 다름).
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
                  doctor_id, visited_at, diagnosis, notes
    )
    select i.id, i.appointment_id, i.patient_id, i.hospital_department_id,
           i.doctor_id, i.visited_at, i.diagnosis, i.notes,
           p.name   as patient_name,
           doc.name as doctor_name,
           d.name   as department_name
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
) -> dict[str, Any] | None:
    """진료 기록 1건을 만들고 같은 문장에서 그 예약을 확정→완료로 전이한다(AD-5).

    스냅샷 3필드(patient/hd/doctor)는 인자로 받지 않는다 — SQL 이 예약 행에서 복사한다(AD-6).
    예약이 더 이상 확정이 아니면(경합) 0행 → None(서비스가 409). 부분 유니크 위반(예약당 기록
    1건)은 UniqueViolation 으로 올라간다(서비스가 409 매핑, 전이도 함께 롤백됨).
    파라미터화 SQL(injection 방지) — placeholder 순서는 SQL 대로 (appointment_id, visited_at,
    diagnosis, notes).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _INSERT_RECORD_AND_COMPLETE,
                (appointment_id, visited_at, diagnosis, notes),
            )
            return cur.fetchone()
