-- 001_rls.sql
-- 9개 테이블 RLS ON (deny-by-default). anon/authenticated 허용 정책은 만들지 않는다.
-- 근거: ARCHITECTURE-SPINE.md AD-7, PRD NFR-4, addendum A1.
-- 앱은 FastAPI가 DATABASE_URL(테이블 소유자)로 접속해 RLS를 우회하므로 정상 동작하고,
-- 브라우저에 노출되는 공개(anon) 키로는 어떤 행도 읽/쓸 수 없게 된다.

alter table public.hospital            enable row level security;
alter table public.department          enable row level security;
alter table public.hospital_department enable row level security;
alter table public.doctor              enable row level security;
alter table public.patient             enable row level security;
alter table public.drug                enable row level security;
alter table public.appointment         enable row level security;
alter table public.medical_record      enable row level security;
alter table public.prescription        enable row level security;
