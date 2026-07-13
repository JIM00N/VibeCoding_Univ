-- 002_uq_record.sql
-- 예약당 진료 기록 1건(1:0..1)을 DB에서 강제하는 부분 유니크 인덱스.
-- walk-in 기록(appointment_id NULL 다건)은 깨지 않는다.
-- 근거: ARCHITECTURE-SPINE.md AD-9, addendum A3, review-datamodel.md [높음] 항목, FR-8.

create unique index if not exists uq_medical_record_appointment
  on public.medical_record (appointment_id)
  where appointment_id is not null;
