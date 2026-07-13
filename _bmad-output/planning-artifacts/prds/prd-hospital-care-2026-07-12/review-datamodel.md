# 데이터 모델 리뷰 — hospital-care PRD

## 종합 판정

정규화 골격(9개 테이블)과 FR의 핵심 매핑은 대체로 정합하며, 특히 "발생 진료과·의사를 medical_record가 자체 보관"(schema.sql:109-110, 둘 다 NOT NULL)과 "예약도 항상 의사 배정 → medical_record.doctor_id NOT NULL"의 개정(FR-6/A3)은 스키마와 잘 맞고, FR이 요구하는데 스키마에 없는 컬럼은 없다. 그러나 문서(NFR-4/A1)가 요구하는 **RLS가 schema.sql에 전혀 없어** 보안 posture가 실제로는 미구현이고, **medical_record.appointment_id에 UNIQUE가 없어** ERD의 예약:기록 1:1과 FR-8 완료전이 전제가 DB에서 깨질 수 있다. FR-15의 (의사, 슬롯) 유일성은 슬롯 컬럼·제약이 하나도 없어 전적으로 앱 로직에 의존한다 — 이 세 가지가 "정규화 위에서 흐름이 끝까지 동작"을 위협하는 핵심 리스크다.

## Findings

- **[높음] RLS 구문이 schema.sql에 전혀 없음 — NFR-4 보안 posture 미구현** (§NFR-4 / §부록 A1 / schema.sql 전체 1-144: `grep`상 RLS·POLICY 0건)
  NFR-4·A1은 9개 테이블 전부 `enable row level security` + anon 정책 미생성(deny-by-default)을 요구하지만, schema.sql에는 `alter table ... enable row level security`도 `create policy`도 하나도 없다. A2가 "Supabase 배포 완료"라고 하므로 이 파일 그대로 배포됐다면 **공개(anon) 키로 전 테이블 읽기/쓰기가 열려 있는 상태**이며 NFR-4가 실제로 적용되지 않았다. A1의 경고("schema.sql에 RLS 없음")·메모로그 경고는 정확 — 현재는 문서상 선언만 존재. *제안:* 배포용 마이그레이션에 9개 테이블 각각 `alter table <t> enable row level security;` 추가 + anon 허용 정책 미생성(service_role 경유만) 확인. 배포된 프로젝트(`fphsxoweprztrekckzui`)의 실제 RLS 상태를 Supabase advisor로 점검해 OFF면 즉시 적용.

- **[높음] medical_record.appointment_id UNIQUE 부재 → 1예약-1기록 미보장** (§FR-8·FR-9 / §부록 A3 / schema.sql:107, erd.md:23)
  `appointment_id bigint references appointment(id) on delete set null` — UNIQUE가 없어 ERD의 `appointment |o--o| medical_record`(1:1)가 DB에서 강제되지 않는다. 한 예약에 진료 기록이 2건 이상 생기면 FR-8의 "진료 기록 작성 시 status 완료 전이"와 FR-11/12 조회가 중복·모순된다. A3가 이미 갭을 명시했으나 미해결. *제안:* walk-in(appointment_id NULL 다건 허용)을 깨지 않으면서 1:1을 보장하는 부분 유니크 인덱스 추가 — `create unique index on medical_record(appointment_id) where appointment_id is not null;`

- **[중간] (의사, 슬롯) 가용성에 DB 안전망 전무 + reserved_at 30분 정렬 CHECK 부재** (§FR-15·FR-16 / §부록 A4 / schema.sql:93 reserved_at, 111 visited_at)
  FR-15/A4는 (의사, 30분 슬롯)당 활성 예약 또는 walk-in 하나만을 요구하지만, ① 슬롯을 표현하는 컬럼/생성열이 없고(원시 timestamptz만 저장), ② `reserved_at`이 30분 격자에 정렬됨을 강제하는 CHECK가 없으며(10:17 같은 값 저장 가능 → 슬롯 키 비교가 깨짐), ③ 충돌 소스가 appointment·medical_record **두 테이블**에 걸쳐 있어(A4 명시) 단일 테이블 부분 유니크 인덱스로도 막을 수 없다. 결과적으로 동시 요청 2건이 같은 (의사, 슬롯)을 각각 예약/walk-in으로 삽입해도 DB가 아무것도 막지 못해 이중배정이 발생한다. 앱 레벨로 충분하다는 A4 판단은 타당하나 **DB 가드가 0**이라는 점은 명시적 리스크. *제안:* 최소 `appointment`에 30분 정렬 CHECK(`extract(minute from reserved_at) in (0,30) and extract(second from reserved_at)=0`)로 슬롯 키 무결성 확보 + 예약/walk-in 생성 검사·삽입을 한 트랜잭션으로 묶어 TOCTOU 완화. 엄밀 강제는 두 소스를 합친 공용 슬롯 테이블/뷰 필요(확장).

- **[낮음] "예약은 항상 의사 배정" 불변식은 앱 전용이며, appointment.doctor_id ON DELETE SET NULL로 뚫릴 수 있음** (§FR-6·FR-7 / schema.sql:92 vs 109)
  개정 FR-6은 "예약은 선택/자동으로 항상 의사 배정"이지만 컬럼은 nullable이라(P0 단순 예약엔 nullable 필요) DB가 불변식을 강제하지 못한다. 추가로 의사 삭제 시 `appointment.doctor_id`가 조용히 NULL이 되어(line 92) 확정 예약이 의사 없는 상태로 남을 수 있다. 진료 기록은 RESTRICT라 보존되며(line 109, 이력 보존 목적과 정합) 정책이 비대칭이다. *제안:* 의사를 물리 삭제 대상에서 제외(비활성 플래그)하거나 삭제 금지 운영정책 명시. P0에서 null-의사로 생성된 대기 예약은 P1 가용성 활성화 전에 반드시 의사 배정으로 정리(앱 로직).

- **[낮음] 환자는 department를 고르는데 예약/기록은 hospital_department_id(NOT NULL)를 요구 — raw department.id 매핑 금지·시드 의존** (§FR-6·FR-13 / §부록 A3 / schema.sql:91, 110, doctor:56)
  `appointment.hospital_department_id`·`medical_record.hospital_department_id`는 전역 `department.id`가 아니라 `hospital_department.id`를 참조한다(둘 다 정규화상 정합). UI의 "진료과"를 `department.id`로 바로 넣으면 FK 위반이고, 선택 진료과에 단일 병원의 `hospital_department` 행이 없으면 삽입 실패한다. 자동 배정도 `doctor.hospital_department_id` 기준이라 같은 전제에 묶인다. *제안:* 생성 시 (단일 hospital_id + 선택 department_id) → `hospital_department_id`를 조회해 저장. 시드(FR-14)에서 hospital 1행 + 노출 진료과별 hospital_department 행 + 진료과당 의사 2명 이상(A4 권장) 보장. 진료과 목록은 hospital_department join 기준으로 노출.

- **[낮음] walk-in도 빈 의사 없으면 거부해야 NOT NULL 삽입 에러 회피** (§FR-16 / schema.sql:109-110)
  walk-in `medical_record`는 `doctor_id`·`hospital_department_id` 모두 NOT NULL. 그 슬롯에 빈 의사가 없으면 기록 생성 자체가 불가(FR-6의 "예약 불가"와 대칭). `hospital_department_id`는 배정 의사의 `doctor.hospital_department_id`에서 유도하면 "생성 시점 소속 = 발생 장소"로 타당. *제안:* walk-in 플로우에서 빈 의사 없을 때 A4대로 **거부**(다른 시각/대기 안내) 처리해 NOT NULL 삽입 에러가 사용자에게 노출되지 않게 함.

- **[낮음/정보] FR 미사용 컬럼은 있으나 누락 컬럼은 없음** (§FR-4·9·10 / schema.sql)
  FR-4(name/birth_date/gender/phone→patient), FR-9(diagnosis/notes/visited_at→medical_record), FR-10(drug_id/dosage/days→prescription)에 필요한 컬럼은 전부 존재해 **FR이 요구하는데 스키마에 없는 컬럼은 없다**. 반대로 `doctor.license_no`, `hospital.address/phone`, `drug.unit`, `appointment.reason`은 어느 FR도 직접 쓰지 않으나 시드/선택 필드로 무해. *제안:* 조치 불필요. FR-5 이름 검색 성능이 필요해지면 `patient(name)` 인덱스만 선택적으로 추가.
