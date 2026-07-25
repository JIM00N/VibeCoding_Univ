-- 005_prescription_printed_at.sql — 처방전 출력 이력(Story 3.3, AD-9).
-- medical_record 에 "마지막 출력 시각" 컬럼 하나를 더한다. null = 미출력, 값 있음 = 마지막 출력 시각.
-- 재출력 시 now() 로 갱신된다(POST /medical-records/{id}/print 가 소유 — 서버 시각 단일 소스).
-- 출력 로그 테이블은 만들지 않는다(사용자 확정 — 감사 추적 필요 시 prescription_print_log 로 승격).
-- nullable 이라 기존 행·3.2 INSERT 경로에 영향 0(기본 null). RLS 는 테이블 단위 — 001 이 이미 ON.
-- (재적용 안전: `if not exists` — 001~003 과 동일한 idempotent 정책. `add column` 은 즉시 완료, 테이블 재작성 없음.)

alter table public.medical_record
  add column if not exists prescription_printed_at timestamptz null;
