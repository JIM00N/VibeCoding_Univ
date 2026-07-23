-- 테스트 데이터 정리 (Epic 2 회고 액션 #1) — 2026-07-23 실행 완료 기록
--
-- 목적: Epic 1~2 검증 중 공유 Supabase에 누적된 테스트 데이터 제거.
--       시드 참조 데이터(병원·진료과·의사·환자 1~3)는 보존.
-- 주의: db/seed/004_seed.sql 재실행 아님(truncate 가드와 무관하게 이 파일만 단독 실행).
--       idempotent — 재실행해도 시드 환자 1~3은 지우지 않는다.
--
-- 실행 시점 실측: patient 12행(시드 3 + 테스트 9: id 4~12),
--                appointment 8행(전부 2026-07-19~20 검증용),
--                medical_record 0행 · prescription 0행.

begin;

delete from public.prescription;        -- 0행 예상 (Epic 3 미착수 — 안전망)
delete from public.medical_record;      -- 0행 예상 (안전망)
delete from public.appointment;         -- 검증용 예약 전량 (실행 시점 8행)
delete from public.patient where id > 3;  -- 테스트 환자 (실행 시점 9행, 시드 1~3 보존)

commit;
