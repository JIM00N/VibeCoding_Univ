# Validation Report — 병원 진료관리 풀스택 서비스 (hospital-care)

- **PRD:** `_bmad-output/planning-artifacts/prds/prd-hospital-care-2026-07-12/prd.md`
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-07-13T15:01:21+0900
- **Grade:** Good

## Overall verdict

문서로서의 PRD는 최상급이다. "넓이보다 한 줄기 관통"이라는 명확한 테제가 성공 지표·역-지표·범위·FR 전체를 일관되게 관통하고, FR-15/16의 가용성·walk-in 충돌 규칙은 데모 스펙치고 이례적으로 정밀하며, 기존 `db-design/` 스키마 참조가 실제 파일과 전부 일치한다. 루브릭 7개 차원이 모두 strong/adequate, 문서 품질 관점의 critical·high 지적은 0건 — 착수 차단 요소는 없다.

다만 "스키마가 PRD의 주장을 실제로 강제하는가"에서 그림이 바뀐다. 적대적·데이터모델 리뷰어가 공통으로 high 4건을 짚었다: ①NFR-4가 요구한 RLS가 schema.sql에 전무해 이미 배포된 DB가 열려 있을 수 있고, ②예약↔기록 1:1이 DB에서 미강제(appointment_id UNIQUE 부재)이며, ③핵심 판매 포인트인 (의사,슬롯) 유일성이 두 테이블에 걸쳐 있어 DB 제약 0개·경쟁 조건에 노출되고, ④P0 범위가 FR-6의 "항상 의사 배정"을 깨서 P0만 구현하면 성공지표 ①의 E2E가 성립하지 않는다. 넷 다 고칠 수 있고 일부는 PRD가 스스로 부록에 flag해 둔 것이라, 문서를 Excellent에서 Good으로 끌어내리되 "구현 전에 닫아야 할 목록"으로 다루면 된다.

## Dimension verdicts

- 의사결정 준비도 (Decision-readiness) — strong
- 실질 대 겉치레 (Substance over theater) — strong
- 전략적 일관성 (Strategic coherence) — strong
- 완료 기준 명확성 (Done-ness clarity) — strong
- 범위 정직성 (Scope honesty) — strong
- 다운스트림 사용성 (Downstream usability) — adequate
- 형태 적합성 (Shape fit) — strong

## Findings by severity

### Critical (0)

없음.

### High (4)

**[적대적]** P0 범위가 FR-6 "항상 의사 배정" 불변식을 깨고 FR-9를 막는다 (§4 P0 / FR-6·FR-9 / schema:92,109)
P0는 "자동배정을 뺀 기본 예약 생성"인데 FR-6은 "예약에는 항상 의사가 배정"이라 못 박았다. P0에서 의사를 비우면 `appointment.doctor_id`가 null로 남고, FR-9/진료기록은 `medical_record.doctor_id NOT NULL`을 요구 → P0 단독으로는 진료 기록을 못 쓴다. 성공지표 ①의 예약→배정→기록 E2E가 P0만으로 성립하지 않는다.
Fix: P0 정의에 "의사 미선택 예약은 직원이 기록 작성 전 수동 배정"을 명시하고 FR-6의 "항상 배정"을 "기록 시점까지 배정"으로 완화. 또는 최소 자동배정을 P0로 끌어올리기.

**[적대적]** 가용성 불변식이 DB에 전혀 강제되지 않는다 — "하나만"은 기도다 (FR-15 / A4 / schema 전체)
"(의사,슬롯)에 활성 예약/walk-in 하나만"은 `appointment`·`medical_record` 두 테이블에 걸쳐 있어 단일 부분 유니크 인덱스로 못 막고 순수 앱-레벨 검사다(A4 인정). TOCTOU 경쟁으로 자동배정이 동시에 같은 의사를 집을 수 있다. DB 제약 0개 → 앱 버그·직접 쿼리 한 방에 조용히 깨진다.
Fix: FR-15를 "동시 요청 없는 단일 세션 전제에서만 차단 보장"으로 격하 명시. 엄밀성은 union 뷰 위 EXCLUDE 제약 또는 점유 전용 `slot_occupancy` 단일화를 확장 항목으로.

**[데이터모델]** RLS 구문이 schema.sql에 전혀 없음 — NFR-4 보안 posture 미구현 (NFR-4 / A1 / schema.sql 전체)
9개 테이블 전부 RLS ON + anon 정책 미생성을 요구하지만 RLS·POLICY가 0건이다. A2가 "배포 완료"라 하므로 이 파일 그대로면 공개(anon) 키로 전 테이블 읽기/쓰기가 열려 있는 상태. A1의 자기 경고는 정확 — 현재는 문서상 선언만.
Fix: 마이그레이션에 9개 테이블 각각 `alter table <t> enable row level security;` + anon 허용 정책 미생성. 배포 프로젝트의 실제 RLS 상태를 Supabase advisor로 점검해 OFF면 즉시 적용.

**[데이터모델]** medical_record.appointment_id UNIQUE 부재 → 1예약-1기록 미보장 (FR-8·FR-9 / schema.sql:107 / erd.md:23)
UNIQUE가 없어 ERD의 1:1이 DB에서 강제되지 않는다. 한 예약에 기록 2건 이상이면 FR-8 완료 전이와 조회가 중복·모순된다. A3가 갭을 명시했으나 미해결.
Fix: 부분 유니크 인덱스 `create unique index on medical_record(appointment_id) where appointment_id is not null;` (walk-in NULL 다건 허용 유지).

### Medium (5)

**[루브릭]** 예약 시 담당 의사 배정 시점이 문서 간 상반되게 읽힘 (§5 FR-6 / 부록 A3)
FR-6·A4는 "항상 배정"인데 A3는 "doctor_id nullable(미배정 허용)"이라 정반대로 읽힌다. 계층(DB 컬럼 허용 vs 앱 정책 강제)이 분리 진술되지 않음.
Fix: A3에 "DB 컬럼은 nullable이나 앱 정책상 예약 생성 시 항상 채운다(FR-6·A4)" 한 줄 추가.

**[적대적]** 주요 사용자 여정이 P1 기능으로 서술돼 P0 구현자를 오도 (UJ-1 step2, UJ-2 step3 vs §4)
UJ의 핵심 동선이 전부 P1(자동배정)에 의존 → P0부터 관통하라는 가드레일을 따르면 문서화된 유일한 여정이 P0에서 성립하지 않는다.
Fix: UJ 각 스텝에 (P0)/(P1) 태그 또는 P0용 수동배정 경로 병기.

**[적대적]** walk-in의 진료과 출처 미명세인데 컬럼은 NOT NULL (FR-16 / schema:110 / A4)
FR-16은 진료과 선택 단계가 없는데 `medical_record.hospital_department_id`는 NOT NULL. "빈 의사"를 범위 지으려면 진료과가 먼저 정해져야 하는데 그 입력이 없다.
Fix: FR-16에 "walk-in 시 직원이 진료과를 먼저 선택하고 그 과의 빈 의사를 배정"을 추가.

**[적대적]** "대기로 처리"는 뒷받침 데이터 없는 dangling path (FR-16 말미 / §4 제외)
§4가 "대기열"을 명시 제외했는데 FR-16은 "대기로 처리"를 언급. 담을 엔티티도 완료 기준도 없어 검증 불가.
Fix: "대기 처리"를 지우고 "빈 의사 없으면 거부 메시지로 종료"로 확정.

**[적대적]** "선택된 환자 데이터만 보인다"는 격리 언어가 실제 노출을 가림 (FR-2 / 성공지표 ③ / A1-5)
로그인이 없어 누구나 임의 환자를 골라 진단·처방을 전부 열람 가능. 의도된 축소지만 FR-2 표현이 격리처럼 오독하게 만든다(caveat이 FR 본문엔 없음).
Fix: FR-2에 "기밀 격리가 아니며 데모상 누구나 임의 환자를 선택·열람할 수 있음" 한 줄 명시.

> 관련 medium 2건(예약:기록 1:1 미강제+완료전이 반쪽 / (의사,슬롯) DB 안전망 부재)은 위 High 3·4로 승격 처리해 중복 계상하지 않음. 3일/1인 P1 미착륙 리스크(medium)는 아래 참고.

### Low (10)

- **[적대적]** 3일·1인·풀스택에 교차테이블 가용성 엔진+walk-in — P1 미착륙 위험 (유형/마감 / §4 P1). *Fix:* "P1 미완 시에도 성공으로 인정되는 최소 데모(수동배정 E2E)"를 성공지표에 명시.
- **[적대적]** 과거·비경계 시각 예약 방지가 앱-레벨뿐 / 타임존 미고정 (FR-6 / A4 / schema:93). *Fix:* "과거 슬롯 예약 거부"를 FR-6에, 타임존(UTC 저장·슬롯 단위 비교)을 A4에.
- **[적대적]** NFR이 제품 특유 임계치 없이 보일러플레이트에 가까움 (§6 NFR-1~5). *Fix:* NFR-5를 "UJ-1·2 각 스텝이 배포 URL에서 클릭만으로 완주"처럼 체크 가능하게.
- **[적대적]** 완료 예약의 슬롯 해제가 walk-in 영구점유와 비대칭 (A4). *Fix:* 확장 노트에 "완료/walk-in 점유 계산 일원화" 메모.
- **[데이터모델]** "예약은 항상 의사 배정"은 앱 전용 + ON DELETE SET NULL로 뚫림 (FR-6·7 / schema:92 vs 109). *Fix:* 의사 물리 삭제 제외(비활성 플래그) 또는 삭제 금지 운영정책.
- **[데이터모델]** 환자는 department 선택인데 예약/기록은 hospital_department_id 요구 (FR-6·13 / schema:91,110). *Fix:* (hospital_id+department_id)로 hospital_department_id 조회 저장, 시드 보장.
- **[데이터모델]** walk-in도 빈 의사 없으면 거부해야 NOT NULL 삽입 에러 회피 (FR-16 / schema:109-110). *Fix:* 빈 의사 없을 때 앱에서 먼저 거부.
- **[루브릭]** 시드 수량 하한이 FR이 아닌 가정에만 존재 (FR-14 / §7). *Fix:* FR-14에 "진료과당 의사 ≥2 시드" 하한 명시.
- **[루브릭]** 정식 Glossary 부재 / 성공지표 ID 없음 / FR-15·16 번호 비연속 (문서 전반·§2·§5). *Fix:* 미니 용어집, SM-1~4 번호, 섹션 내 재번호.
- **[데이터모델/정보]** FR 미사용 컬럼은 있으나 누락 컬럼은 없음 (schema 전체). 조치 불필요.

## Mechanical notes

- 스키마 대조(검증 완료): 부록 A1·A3의 스키마 서술이 실제 `db-design/schema.sql`과 모두 일치 — 존재 코드 참조 정확.
- 참조 경로: §8의 `db-design/`는 상대경로로 해소 안 됨(실제는 리포 루트). 루트 기준 경로 통일 권장.
- ID 연속성: FR-1~16 전부 존재·유일(단 15·16 후행 배치). UJ 정상. 성공 지표 무번호.
- Assumptions 색인 왕복: 인라인 [ASSUMPTION](FR-2)이 §7에 재등장, 성립. "시드 규모" 가정은 인라인 앵커 없이 §7에만.
- 필수 섹션: 과제 stake·제품 유형 기준 필요한 섹션 모두 present.

## Reviewer files

- `review-rubric.md`
- `review-adversarial.md`
- `review-datamodel.md`
