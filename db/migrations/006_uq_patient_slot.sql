-- 006_uq_patient_slot.sql — 환자 1인 동시 예약 금지 (2026-07-28 chore, FR-15 보강).
-- FR-15 의 가용성 단위는 (의사, 30분 슬롯)이라 **환자 기준** 중복이 통과했다: 한 환자가 같은
-- 시각에 서로 다른 의사로 두 번 예약할 수 있었다(라이브 실측 — 박지훈 2026-07-28 09:00 KST,
-- appointment id 68·69, doctor 3·4 둘 다 '대기'). 사람은 같은 시각에 두 진료를 받을 수 없다.
--
-- 왜 앱 게이트(db/availability.py)가 아니라 DB 제약인가:
--   ① 코드가 더 적다 — 게이트 조각을 한 벌 더 만들어 INSERT 문 둘에 얹는 대신 인덱스 하나.
--   ② 앱 게이트가 못 막는 동시 요청 경쟁(TOCTOU)까지 닫힌다(AD-4 가 명시적 범위 밖으로 둔 것).
--
-- reserved_at 을 그대로 인덱스 키로 쓴다 — 003 의 30분 격자 CHECK 가 이미 걸려 있어 raw 컬럼이
-- 곧 슬롯이다. date_bin 식을 넣을 필요가 없다(식 인덱스의 immutability 제약도 회피).
--
-- 부분 인덱스(활성만): 취소·완료는 키에서 빠져 슬롯이 자연히 해제된다 — 2.2 status 전이가
-- "별도 해제 로직 없음"으로 성립하는 것과 같은 규약이다(취소=해제, 완료=무관).
--
-- 경계(정직): walk-in 기록(medical_record.appointment_id null)은 이 인덱스가 못 본다 — 단일
-- 테이블 제약이라서다. 현재 그 행은 **0건**이고, 전용 walk-in 경로는 2026-07-28 correct-course
-- 로 철회돼(FR-16 축소) 새로 생기지 않는다. 되살린다면 앱 게이트 쪽 형제 조건이 필요하다.
--
-- 근거: FR-15(epics.md), ARCHITECTURE-SPINE.md AD-4.
-- (재적용 안전: `if not exists` — 001~005 와 동일한 idempotent 정책. 002 의 부분 유니크 인덱스와 같은 관용구.)
-- ⚠️ 선행 조건: 기존 위반 행을 먼저 정리해야 생성이 성공한다(위 id 69 삭제 — 적용 시 수행함).

create unique index if not exists uq_appointment_patient_slot
  on public.appointment (patient_id, reserved_at)
  where status in ('대기', '확정');
