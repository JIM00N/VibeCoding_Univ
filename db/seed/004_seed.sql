-- 004_seed.sql — 시연용 참조 데이터 시드 (FR-13, FR-14)
-- 근거: ARCHITECTURE-SPINE.md AD-9, PRD/addendum(진료과당 의사 2명 이상 권장).
--
-- 규칙:
--  * PK가 GENERATED ALWAYS AS IDENTITY 라 평범한 명시-id INSERT는 에러 → OVERRIDING SYSTEM VALUE 사용.
--  * OVERRIDING SYSTEM VALUE 는 identity 시퀀스를 진행시키지 않으므로, 시드 끝에서 setval 로 시퀀스를 max(id)로 맞춘다
--    (안 하면 이후 앱의 일반 INSERT가 id=1부터 생성해 PK 충돌 — Story 1.3 환자 등록에서 터짐).
--  * 재실행 가능하도록 먼저 TRUNCATE ... RESTART IDENTITY CASCADE.
--  * 예약/진료기록/처방은 시드하지 않는다(후속 스토리가 UI로 생성).
--
-- ⚠️ 재시드 안전 가드 (Epic 1 회고 액션 #3 — 옵션 c "비어있을 때만 시드"):
--   Story 2.1(예약)부터 UI로 만든 트랜잭션 데이터가 공유 DB에 쌓인다. 아래 가드는 이미
--   환자/예약/진료기록이 있으면 시드를 통째로 중단해, 재실행이 그 데이터를 TRUNCATE 로 지우지
--   못하게 막는다. (Supabase SQL 에디터/psql 은 스크립트를 한 트랜잭션으로 실행하므로 예외가
--   나면 뒤의 TRUNCATE 가 커밋되지 않는다.)
--   → 정말로 데모 DB를 처음부터 초기화하려면 이 do 블록만 임시로 주석 처리하고 실행하세요.
do $$
begin
  if exists (select 1 from public.patient)
     or exists (select 1 from public.appointment)
     or exists (select 1 from public.medical_record) then
    raise exception
      '시드 중단: 이미 데이터가 있어요(환자/예약/진료기록). 재시드는 이 데이터를 지웁니다. 초기화가 목적이면 004_seed.sql 상단 가드 do 블록을 임시로 주석 처리하세요.';
  end if;
end $$;

truncate table
  public.prescription,
  public.medical_record,
  public.appointment,
  public.patient,
  public.doctor,
  public.hospital_department,
  public.department,
  public.drug,
  public.hospital
  restart identity cascade;

-- 병원 1곳 (단일 병원 전제)
insert into public.hospital (id, name, address, phone) overriding system value values
  (1, '서울중앙병원', '서울특별시 중구 세종대로 100', '02-1234-5678');

-- 전역 진료과 코드 (department)
insert into public.department (id, name) overriding system value values
  (1, '내과'),
  (2, '이비인후과'),
  (3, '정형외과');

-- 병원별 개설 진료과 (hospital_department) — appointment/medical_record 가 참조하는 대상
insert into public.hospital_department (id, hospital_id, department_id) overriding system value values
  (1, 1, 1),   -- 서울중앙병원 · 내과
  (2, 1, 2),   -- 서울중앙병원 · 이비인후과
  (3, 1, 3);   -- 서울중앙병원 · 정형외과

-- 의사 — 진료과(hospital_department)당 2명 이상 (자동배정·충돌 시연용, A4)
insert into public.doctor (id, hospital_department_id, name, license_no) overriding system value values
  (1, 1, '김민수', 'MD-10001'),   -- 내과
  (2, 1, '이지은', 'MD-10002'),   -- 내과
  (3, 2, '김민재', 'MD-20001'),   -- 이비인후과 (UX 시나리오 주인공 의사)
  (4, 2, '박서연', 'MD-20002'),   -- 이비인후과
  (5, 3, '최현우', 'MD-30001'),   -- 정형외과
  (6, 3, '정하늘', 'MD-30002');   -- 정형외과

-- 약품 마스터
insert into public.drug (id, name, unit) overriding system value values
  (1, '타이레놀정 500mg', '정'),
  (2, '아목시실린캡슐 250mg', '캡슐'),
  (3, '이부프로펜정 200mg', '정'),
  (4, '세티리진정 10mg', '정');

-- 환자 몇 명 (이수민 = UX 시나리오 주인공)
insert into public.patient (id, name, birth_date, gender, phone) overriding system value values
  (1, '이수민', '1992-03-14', 'F', '010-1111-2222'),
  (2, '박지훈', '1985-11-02', 'M', '010-3333-4444'),
  (3, '최유진', '2000-07-21', 'F', '010-5555-6666');

-- identity 시퀀스를 현재 max(id)로 재정렬 (이후 앱 INSERT가 다음 값부터 생성하도록)
select setval(pg_get_serial_sequence('public.hospital', 'id'),            (select max(id) from public.hospital));
select setval(pg_get_serial_sequence('public.department', 'id'),          (select max(id) from public.department));
select setval(pg_get_serial_sequence('public.hospital_department', 'id'), (select max(id) from public.hospital_department));
select setval(pg_get_serial_sequence('public.doctor', 'id'),              (select max(id) from public.doctor));
select setval(pg_get_serial_sequence('public.drug', 'id'),                (select max(id) from public.drug));
select setval(pg_get_serial_sequence('public.patient', 'id'),             (select max(id) from public.patient));
