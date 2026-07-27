"""가용성(충돌 판정) SQL 조각·조회. db 계층 — 유일한 DB 접근 지점 (AD-2).

Story 5.1(FR-15)의 단일 관문. (의사, 슬롯) 점유 판정의 source of truth 인 SQL 조각을
이 모듈에 **정확히 한 벌**만 정의하고, 점유가 발생하는 쓰기 문(db/appointments.py 의
_INSERT_APPOINTMENT·_UPDATE_APPOINTMENT_DOCTOR)과 아래 범위 조회가 조합해 쓴다(AD-3·AD-4).

AD-4 의 `check_and_occupy(conn, …)` 은 이 프로젝트의 확립 관용구인 **"단일 CTE 문 =
한 커넥션 = 한 트랜잭션"**(Epic 2 회고 액션 #4, 3.1 기록+완료 전이 선례)으로 이행한다 —
검사와 쓰기가 같은 SQL 문 안이라 문장 원자성이 성립하고, conn 전달식 커넥션 개편이
필요 없다. 5.2(자동 배정)·5.3(walk-in)도 이 조각을 그대로 재사용한다(로직 발산 방지).

경계(정직): 단일 세션 전제에서 차단을 보장하며 동시 요청 경쟁(TOCTOU)의 완전 차단은
범위 밖이다(아키텍처 Deferred — EXCLUDE 제약/점유 테이블 단일화).
"""
from __future__ import annotations

from datetime import datetime

from psycopg.rows import dict_row

from app.db.pool import get_pool


class SlotTakenError(Exception):
    """(의사, 슬롯) 점유 충돌 — 게이트 문이 쓰기를 거부했다. 서비스가 409 로 매핑한다.

    반환 형태 대신 예외로 올리는 이유: 기존 db 함수의 "row | None" 계약을 그대로 보존해
    호출 서비스·테스트 픽스처가 무수정으로 살아남는다(스토리 AC8).
    """


# 슬롯 floor 식 — SQL 쪽 유일한 정의(AD-3; Python 쪽은 app/slots.py to_slot 이 미러).
# date_bin 은 절대시간 연산이라 세션 TimeZone 과 무관하다 — date_trunc('hour') 는 세션 tz 를
# 타서 비정시 오프셋 tz 에서 어긋난다. PG14+ 내장(Supabase 충족). {col} 자리에 컬럼/식을 넣는다.
SLOT_EXPR = "date_bin('30 minutes', {col}, timestamptz '2000-01-01 00:00:00+00')"

# 충돌원 합집합(AD-4): 활성 예약(대기·확정) ∪ walk-in 기록(appointment_id null).
# 취소=해제·완료=무관은 status 필터가 자연 처리한다(별도 해제 로직 없음).
# %(exclude_appointment_id)s 는 의사 변경의 자기 행 제외용 — 생성·조회는 None 을 넘긴다
# (조각을 한 벌로 유지하기 위한 nullable 파라미터). 파라미터는 named(%(name)s) — 이 조각을
# 내장하는 문 전체가 named 로 통일해야 한다(한 문장 안 positional 혼용 금지).
OCCUPIED_SOURCES = """
        select a.reserved_at as occupied_at
        from public.appointment a
        where a.doctor_id = %(doctor_id)s
          and a.status in ('대기', '확정')
          and (%(exclude_appointment_id)s::bigint is null or a.id <> %(exclude_appointment_id)s)
        union all
        select m.visited_at
        from public.medical_record m
        where m.doctor_id = %(doctor_id)s
          and m.appointment_id is null
"""


def slot_taken_sql(slot_sql: str) -> str:
    """점유 여부 point 판정(exists) 조각을 만든다 — 게이트 문의 taken CTE 가 내장한다.

    slot_sql 은 비교할 시각의 SQL 표현식(예: "%(reserved_at)s", "(select reserved_at from target)").
    비교 **양변 모두** floor 식을 적용한다 — visited_at 은 30분 CHECK 가 없고, 저장 형태에
    의존하지 않는 것이 AD-3 규칙이다(원시 timestamp 직접 비교 금지).
    """
    return f"""exists (
        select 1
        from ({OCCUPIED_SOURCES}) o
        where {SLOT_EXPR.format(col="o.occupied_at")} = {SLOT_EXPR.format(col=slot_sql)}
    )"""


# 한 의사의 [start, end) 범위 점유 슬롯 — 프런트 슬롯 피커의 taken 셀 사전 표시용(UX-DR3).
# 사전 표시는 예방일 뿐 최종 차단은 쓰기 게이트(409)가 담당한다(서버가 가용성의 진실).
_SELECT_TAKEN_SLOTS = f"""
    select distinct {SLOT_EXPR.format(col="o.occupied_at")} as slot
    from ({OCCUPIED_SOURCES}) o
    where o.occupied_at >= %(start)s
      and o.occupied_at < %(end)s
    order by slot
"""


def select_taken_slots(doctor_id: int, start: datetime, end: datetime) -> list[datetime]:
    """한 의사의 [start, end) 점유 슬롯 시작 시각 목록을 반환한다. 파라미터화 SQL(injection 방지)."""
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _SELECT_TAKEN_SLOTS,
                {
                    "doctor_id": doctor_id,
                    "exclude_appointment_id": None,
                    "start": start,
                    "end": end,
                },
            )
            return [row["slot"] for row in cur.fetchall()]
