-- 003_reserved_at_check.sql — appointment.reserved_at 를 30분 격자(분 ∈ {0,30}, 초=0)로만 저장하도록 강제.
-- 슬롯 키 무결성 보강 → 10:17 같은 값 저장을 막아 (의사, 슬롯) 비교가 깨지지 않게 한다.
-- minute 기반이라 KST 같은 정시-오프셋 tz에서 tz-불변.
-- 근거: ARCHITECTURE-SPINE.md AD-3/AD-9, addendum A4, FR-15.
-- (재적용 안전: 제약이 이미 있으면 건너뛴다 — 001·002 와 동일한 idempotent 정책.)

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointment_reserved_at_slot_check'
  ) then
    alter table public.appointment
      add constraint appointment_reserved_at_slot_check
      check (
        extract(minute from reserved_at) in (0, 30)
        and extract(second from reserved_at) = 0
      );
  end if;
end $$;
