"""가용성(충돌 판정) SQL 조각·조회. db 계층 — 유일한 DB 접근 지점 (AD-2).

Story 5.1(FR-15)의 단일 관문. (의사, 슬롯) 점유 판정의 source of truth 인 SQL 조각을
이 모듈에 **정확히 한 벌**만 정의하고, 점유가 발생하는 쓰기 문(db/appointments.py 의
_INSERT_APPOINTMENT·_UPDATE_APPOINTMENT_SCHEDULE)과 아래 범위 조회가 조합해 쓴다(AD-3·AD-4).

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


class NoFreeDoctorError(Exception):
    """진료과 전 의사가 그 슬롯에 점유 — 자동 pick 이 빈 의사를 못 찾았다. 서비스가 409 로
    매핑한다(Story 5.2 자동 배정). 5.3 walk-in 의 "빈 의사 없으면 거부"도 이 예외를 쓴다.
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
# doctor_sql 은 판정 대상 의사의 SQL 표현식 — 기본값(파라미터)이면 기존 소비자와 생성 SQL 이
# 동일하고, 자동 pick(Story 5.2)은 상관 컬럼("d.id")을 넣어 의사별 판정으로 재사용한다(조각 1벌).
def occupied_sources_sql(doctor_sql: str = "%(doctor_id)s") -> str:
    return f"""
        select a.reserved_at as occupied_at
        from public.appointment a
        where a.doctor_id = {doctor_sql}
          and a.status in ('대기', '확정')
          and (%(exclude_appointment_id)s::bigint is null or a.id <> %(exclude_appointment_id)s)
        union all
        select m.visited_at
        from public.medical_record m
        where m.doctor_id = {doctor_sql}
          and m.appointment_id is null
"""


def slot_taken_sql(slot_sql: str, doctor_sql: str = "%(doctor_id)s") -> str:
    """점유 여부 point 판정(exists) 조각을 만든다 — 게이트 문의 taken CTE 가 내장한다.

    slot_sql 은 비교할 시각의 SQL 표현식(예: "%(reserved_at)s", "(select reserved_at from target)").
    doctor_sql 은 판정 대상 의사의 SQL 표현식(기본 = %(doctor_id)s 파라미터, 자동 pick 은 "d.id").
    비교 **양변 모두** floor 식을 적용한다 — visited_at 은 30분 CHECK 가 없고, 저장 형태에
    의존하지 않는 것이 AD-3 규칙이다(원시 timestamp 직접 비교 금지).
    """
    return f"""exists (
        select 1
        from ({occupied_sources_sql(doctor_sql)}) o
        where {SLOT_EXPR.format(col="o.occupied_at")} = {SLOT_EXPR.format(col=slot_sql)}
    )"""


def free_doctor_sql(slot_sql: str) -> str:
    """진료과(%(hospital_department_id)s) 의사 중 slot_sql 슬롯이 빈 의사 1명을 고르는 서브쿼리
    조각 — Story 5.2 자동 배정·5.3 walk-in 이 공유한다(AD-4 "같은 헬퍼", 재정의 금지).

    pick 은 id 오름차순 결정적(테스트·실증 용이) — 부하 분산은 YAGNI. 진료과에 의사가 아예
    없어도 0행이라, "빈 과"와 "전원 점유"의 구분(400 vs 409)은 서비스 선검증이 담당한다.
    """
    return f"""(
        select d.id
        from public.doctor d
        where d.hospital_department_id = %(hospital_department_id)s
          and not {slot_taken_sql(slot_sql, doctor_sql="d.id")}
        order by d.id
        limit 1
    )"""


# 한 의사의 [start, end) 범위 점유 슬롯 — 프런트 슬롯 피커의 taken 셀 사전 표시용(UX-DR3).
# 사전 표시는 예방일 뿐 최종 차단은 쓰기 게이트(409)가 담당한다(서버가 가용성의 진실).
# 범위 판정은 원시 occupied_at 이 아니라 **floor 된 슬롯 기준**이다(코드리뷰) — walk-in
# visited_at 은 30분 CHECK 가 없어 비정렬이 실존하고, 원시 비교는 비정렬 start/end 입력에서
# 범위 밖 슬롯을 돌려주거나 점유를 누락한다("[start, end) 점유 슬롯" 계약 유지, 5.2·5.3 재사용 대비).
_SELECT_TAKEN_SLOTS = f"""
    select s.slot
    from (
        select distinct {SLOT_EXPR.format(col="o.occupied_at")} as slot
        from ({occupied_sources_sql()}) o
    ) s
    where s.slot >= %(start)s
      and s.slot < %(end)s
    order by s.slot
"""


# 한 환자의 [start, end) 활성 예약 슬롯 — 환자 축 사전 표시용(FR-15b, 2026-07-28 chore).
# ⚠️ 006 부분 유니크 인덱스와 **판정 범위가 정확히 같아야 한다**(status in ('대기','확정'),
# appointment 만). 넓히면 서버가 받아줄 슬롯을 화면이 막고(과다 차단), 좁히면 제출 후 409 가
# 튀어나온다. walk-in medical_record 를 합집합하지 않는 것도 그래서다 — 인덱스가 단일 테이블
# 제약이라 그 arm 을 못 보고, 화면만 막으면 두 층이 어긋난다.
# 의사 축(_SELECT_TAKEN_SLOTS)과 달리 doctor 조건이 없다 — 이 축은 의사와 무관하다.
# 자기 행 제외(Story 7.1, FR-19)는 의사 축 조각(occupied_sources_sql)과 **같은 관용구**를 쓴다 —
# 일정 변경 다이얼로그가 그 예약 자신의 슬롯을 taken 으로 그리면 "시각 유지 + 의사만 변경"이
# 화면에서 막힌다(서버는 exclude_appointment_id 로 허용하는데 UI 만 좁아지는 어긋남).
# ⚠️ 두 축 **모두** 제외해야 한다: 자기 예약은 환자 축에도 들어 있어 한쪽만 고치면 여전히 막힌다.
_SELECT_PATIENT_TAKEN_SLOTS = f"""
    select distinct {SLOT_EXPR.format(col="a.reserved_at")} as slot
    from public.appointment a
    where a.patient_id = %(patient_id)s
      and a.status in ('대기', '확정')
      and (%(exclude_appointment_id)s::bigint is null or a.id <> %(exclude_appointment_id)s)
      and {SLOT_EXPR.format(col="a.reserved_at")} >= %(start)s
      and {SLOT_EXPR.format(col="a.reserved_at")} < %(end)s
    order by slot
"""


def select_patient_taken_slots(
    patient_id: int, start: datetime, end: datetime, exclude_appointment_id: int | None = None
) -> list[datetime]:
    """한 환자의 [start, end) 활성 예약 슬롯 시작 시각 목록(FR-15b). 파라미터화 SQL.

    exclude_appointment_id 를 주면 그 예약 자신을 제외한다(Story 7.1 — 일정 변경 사전 표시).
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _SELECT_PATIENT_TAKEN_SLOTS,
                {
                    "patient_id": patient_id,
                    "exclude_appointment_id": exclude_appointment_id,
                    "start": start,
                    "end": end,
                },
            )
            return [row["slot"] for row in cur.fetchall()]


def select_taken_slots(
    doctor_id: int, start: datetime, end: datetime, exclude_appointment_id: int | None = None
) -> list[datetime]:
    """한 의사의 [start, end) 점유 슬롯 시작 시각 목록을 반환한다. 파라미터화 SQL(injection 방지).

    exclude_appointment_id 를 주면 그 예약 자신을 제외한다(Story 7.1 — 일정 변경 사전 표시).
    조각(occupied_sources_sql)의 nullable 파라미터를 채우는 것뿐이라 None 이면 기존 판정과 동일하다.
    """
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                _SELECT_TAKEN_SLOTS,
                {
                    "doctor_id": doctor_id,
                    "exclude_appointment_id": exclude_appointment_id,
                    "start": start,
                    "end": end,
                },
            )
            return [row["slot"] for row in cur.fetchall()]
