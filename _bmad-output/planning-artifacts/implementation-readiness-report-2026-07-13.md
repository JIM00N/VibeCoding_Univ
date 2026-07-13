---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
documentsIncluded:
  - 'prds/prd-hospital-care-2026-07-12/prd.md'
  - 'architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md'
  - 'epics.md'
  - 'ux-designs/ux-hospital-care-2026-07-13/DESIGN.md'
  - 'ux-designs/ux-hospital-care-2026-07-13/EXPERIENCE.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-13
**Project:** hospital-care

---

## PRD Analysis

**Source:** `prds/prd-hospital-care-2026-07-12/prd.md` (완독 · 117줄)
**과제 성격:** 교육 과제(바이브 코딩) · 1인 개발 · 마감 2026-07-16(목). 목표 = 정규화된 9개 엔티티 위에서 환자↔병원 전체 흐름 E2E 관통 + 공개 URL 배포.

### Functional Requirements

- **FR-1** 첫 화면에서 `[환자]`/`[직원]` 역할 선택 (실제 로그인 없음). *(P0)*
- **FR-2** `[환자]` 선택 시 환자 목록에서 본인 선택 → 이후 선택된 환자 데이터만 노출(앱 레벨 필터, 기밀 격리 아님). *(P0)*
- **FR-3** `[직원]` 선택 시 신원 선택 없이 직원 화면(전체 데이터 접근) 진입. *(P0)*
- **FR-4** 직원이 신규 환자 등록 — 이름(필수)·생년월일·성별·연락처. *(P0)*
- **FR-5** 직원이 환자 목록 조회 + 이름 검색. *(P0)*
- **FR-6** 환자가 진료과 + 30분 슬롯 선택해 예약 생성. **(P0)** 담당 의사 직접 선택 필수(→ `doctor_id` 항상 채움). **(P1)** 의사 미지정 시 자동 배정, 빈 의사 없으면 예약 불가.
- **FR-7** 직원이 예약 확정/취소 + 담당 의사 변경(재배정). 재배정 시 가용성(FR-15) 재검사. *(확정/취소 P0 · 재배정 재검사 P1)*
- **FR-8** 예약 상태 흐름(대기→확정→완료/취소). 기록 작성 시 같은 트랜잭션에서 완료 전이. 정상 예약당 진료 기록 1건만(부분 유니크 인덱스 강제, A3). walk-in은 완료 전이 대상 아님. *(P0)*
- **FR-9** 확정 예약에 진료 기록 작성 — 진단명·소견·진료일시. 발생 진료과 자체 보관(이력 보존). 작성 시 담당 의사 지정돼 있어야 함. *(P0)*
- **FR-10** 진료 기록에 처방 0개 이상 추가 — 약 선택 + 용법·용량·처방일수. *(P0)*
- **FR-11** 환자가 자기 예약 목록 + 지난 진료 기록(진단·처방) 조회. *(P0)*
- **FR-12** 직원이 환자별 전체 진료 내역(예약·진료·처방) 조회. *(P0)*
- **FR-13** 참조 데이터(병원 1개·진료과·의사·약)가 시드로 존재(관리 화면 없음). *(P0)*
- **FR-14** 시연용 초기 시드 데이터 포함(환자·진료과·의사·약). *(P0)*
- **FR-15** 가용성 규칙 — 공통 (의사, 슬롯) 단위 충돌 차단. 앱(FastAPI) 레벨 검사(단일 세션 전제, TOCTOU 완전차단 범위 밖). `reserved_at` 30분 정렬 DB CHECK 보강(A4). *(P1)*
- **FR-16** walk-in 즉시 진료 — 예약 없이 빈 의사에게 즉시 진료·기록(`appointment_id` 없음). (의사,슬롯) 점유. 빈 의사 없으면 거부. *(P1)*

**Total FRs: 16** (P0: FR-1~14 핵심 + FR-7 확정/취소 · P1: FR-15, FR-16, FR-6 자동배정, FR-7 재배정 재검사)

### Non-Functional Requirements

- **NFR-1 (배포)** 공개 URL 시연 — 프런트 Vercel · 백엔드(FastAPI) Railway. 초반에 배포 뼈대부터. *(P0)*
- **NFR-2 (데이터 정합성)** 실제 Supabase(PostgreSQL), ERD의 FK·CHECK 제약 준수.
- **NFR-3 (스택)** 프런트 Next.js · 백엔드 FastAPI(Python). 브라우저는 Supabase 직접 호출 금지, FastAPI만 호출.
- **NFR-4 (인증·보안)** 로그인 제외(역할 선택 대체). 9개 테이블 전부 RLS ON, anon 키 DB 직접 접근 차단. 모든 DB 접근은 FastAPI(서버 키) 경유. 배포 전 RLS ON 확인(Supabase advisor). RLS 활성화 마이그레이션은 P0 초기 산출물. *(A1)*
- **NFR-5 (사용성)** 브라우저에서 전체 흐름 눈으로 끝까지 확인 가능. 한국어 UI.

**Total NFRs: 5**

### Additional Requirements / Constraints

- **마감:** 2026-07-16(목) — P0 E2E(등록→의사 직접선택 예약→확정→기록→조회)가 배포 URL에서 관통하면 최소 성공.
- **가드레일:** 넓이보다 "한 줄기 관통" 우선. 부가 기능 확장으로 핵심 배포 지연 시 실패로 간주.
- **단일 병원 전제** — 병원 선택 없음, 진료과만 선택.
- **슬롯 = 30분 격자.** 예약은 30분 단위, walk-in은 진료 시각을 슬롯으로 내림.
- **데이터:** 9개 테이블(ERD·SQL `db-design/`), Supabase 프로젝트 `hospital-care`(`fphsxoweprztrekckzui`).
- **제외:** 실제 로그인/인증, 병원 선택, 참조데이터 관리 화면, 결제·수납·보험·재고·진단서·알림·대기열·모바일 앱·고도화 권한/감사로그.
- **오픈 이슈:** 환자 신원 선택 방식(이름 목록)은 추후 변경 가능. 시드 규모는 개발자 재량(진료과당 의사 2명+ 권장).

### PRD Completeness Assessment (초기)

- **강점:** FR/NFR이 명확히 번호화·우선순위화(P0/P1)돼 추적성이 좋음. 최소 성공 기준이 명시돼 마감 리스크 관리 가능. 정직한 경계(TOCTOU, 기밀 격리 아님)를 스스로 표기.
- **주의 지점:** FR-8의 "완료 전이 = 기록 저장의 트랜잭션 부작용", FR-15의 "두 테이블(appointment·medical_record)에 걸친 앱 레벨 충돌 검사"는 에픽/스토리에서 명확히 구현 단위로 잡혔는지 후속 단계에서 검증 필요. addendum.md(A1·A3·A4)의 DB 제약이 스토리에 반영됐는지 확인 필요.

---

## Epic Coverage Validation

**Source:** `epics.md` (완독 · 536줄 · 5 Epics / 15 Stories). 에픽 문서에 명시적 **FR Coverage Map** 포함.

### Coverage Matrix

| FR | PRD 요구사항(요약) | Epic / Story 커버리지 | 상태 |
|----|----|----|----|
| FR-1 | 역할(환자/직원) 선택 | Epic 1 · Story 1.1a (첫 화면 역할 버튼) | ✓ Covered |
| FR-2 | 환자 신원 선택 + 앱 레벨 필터 | Epic 1 · Story 1.4 | ✓ Covered |
| FR-3 | 직원 화면 진입(전체 접근) | Epic 1 · Story 1.1a | ✓ Covered |
| FR-4 | 신규 환자 등록 | Epic 1 · Story 1.2 | ✓ Covered |
| FR-5 | 환자 목록 조회·이름 검색 | Epic 1 · Story 1.3 | ✓ Covered |
| FR-6 | 예약 생성(P0 의사 직접선택 / P1 자동배정) | Epic 2 · Story 2.1 (P0) · Epic 5 · Story 5.2 (P1) | ✓ Covered |
| FR-7 | 확정/취소 + 의사 변경(재배정) | Epic 2 · Story 2.2 (확정/취소) + Story 2.3 (변경) · Epic 5 · Story 5.1 (재배정 재검사 P1) | ✓ Covered |
| FR-8 | 상태 흐름 + 완료 전이 + 1기록 제약 | Epic 2 · Story 2.2 (대기→확정→취소) · Epic 3 · Story 3.1 (완료 전이 + 부분유니크 1기록) | ✓ Covered |
| FR-9 | 확정 예약에 진료 기록 작성 | Epic 3 · Story 3.1 | ✓ Covered |
| FR-10 | 처방 0..N 추가 | Epic 3 · Story 3.2 | ✓ Covered |
| FR-11 | 환자 자기 예약·진료기록 조회 | Epic 4 · Story 4.1 | ✓ Covered |
| FR-12 | 직원 환자별 전체 내역 조회 | Epic 4 · Story 4.2 | ✓ Covered |
| FR-13 | 참조 데이터 시드 존재 | Epic 1 · Story 1.1a | ✓ Covered |
| FR-14 | 시연용 초기 시드 데이터 | Epic 1 · Story 1.1a | ✓ Covered |
| FR-15 | (의사, 슬롯) 가용성 충돌 차단 (P1) | Epic 5 · Story 5.1 | ✓ Covered |
| FR-16 | walk-in 즉시 진료 (P1) | Epic 5 · Story 5.3 | ✓ Covered |

### Missing Requirements

- **누락된 FR: 없음.** PRD의 16개 FR 전부가 특정 Epic·Story로 추적됨.
- **PRD에 없는데 에픽에만 있는 FR: 없음.** 에픽의 Requirements Inventory가 PRD FR 목록과 1:1로 일치.
- **NFR 매핑 확인:** NFR-1(배포)→Story 1.1b · NFR-2(데이터 정합성)→Epic 1 · NFR-3(스택)→Story 1.1a · NFR-4(RLS·보안)→Story 1.1a+1.1b(advisor 확인 AC 포함) · NFR-5(사용성·한국어)→전 에픽 횡단(UX-DR). 5개 NFR 모두 커버.

### Coverage Statistics

- **Total PRD FRs:** 16
- **FRs covered in epics:** 16
- **Coverage percentage:** **100%**
- **Total NFRs:** 5 / **covered:** 5 (100%)
- **관찰:** 커버리지가 명목상 완전할 뿐 아니라, 각 FR이 구체적 Story의 Given/When/Then AC로 내려가 있고 P0/P1 경계가 에픽 수준에서 유지됨(Epic 5 착수 게이트 명시). 세부 정합성(FR-8 완료 전이의 트랜잭션 단위, FR-15 두 테이블 충돌원)은 다음 단계(UX 정합 · 스토리 품질)에서 계속 검증.

---

## UX Alignment Assessment

**Source:** `ux-designs/ux-hospital-care-2026-07-13/DESIGN.md`(디자인 스파인 · 119줄) + `EXPERIENCE.md`(경험 스파인 · 143줄). 둘 다 완독.

### UX Document Status

- ✅ **Found** — 시각(DESIGN)·행동(EXPERIENCE) 두 스파인으로 분리, 상태 `final`. UI가 강하게 함의된 앱(브라우저 전체 흐름이 성공 지표)이라 UX 문서 존재는 필수였고 충족됨.
- 렌더 검증된 목업 2종(`mockups/booking.html` 슬롯 피커, `mockups/record.html` 진료 기록) 참조. 나머지 화면은 spine-only + IA 표로 빌드. **충돌 시 스파인 우선** 규칙 명시.

### UX ↔ PRD Alignment

- **여정 일치:** EXPERIENCE의 Key Flow 1(환자 예약)·Flow 2(직원 등록→기록→완료)·Flow 3(walk-in)이 PRD의 UJ-1·UJ-2와 정확히 대응.
- **FR 대응:** IA 표의 10개 화면이 FR-1~16 전부를 담음 — 역할 선택(FR-1/3), 환자 신원 선택(FR-2), 환자 등록/검색(FR-4/5), 예약 잡기(FR-6 P0 의사 직접선택), 예약 관리(FR-7/8), 진료 기록·처방(FR-9/10), 조회(FR-11/12), walk-in(FR-16 P1). "IA 닫힘 확인" 문단이 이를 자체 검증.
- **UX가 추가한 것(PRD 초과 아님):** "무인증 데모 어포던스"·Role Context Bar는 신규 발명이지만 PRD FR-2의 "기밀 격리 아님" 단서와 AD-8을 UX로 구체화한 것 — 충돌이 아니라 정합적 확장.

### UX ↔ Architecture Alignment

- **AD-1(3-tier):** "데이터는 오직 FastAPI 통해, 프런트 DB 미접근" 명시 — 일치.
- **AD-10(단일 API 계약):** "단일 API 클라이언트 `lib/api.ts` 하나로만 호출" — 일치.
- **AD-4(check_and_occupy):** 슬롯 피커 "서버가 가용성의 진실 → 제출 시 재검증, 충돌 시 taken 갱신", 비관적 저장 — 일치.
- **AD-5(status 전이):** 진료 기록 폼 "확정 예약만 진입", 저장 시 완료 전이가 UX 배지 전환으로 표현 — 일치.
- **AD-6(walk-in 이력 저장·거부):** walk-in 빈 의사 없음 red Dialog 종료(대기열 없음) — 일치.
- **AD-8(환자 스코핑):** `?patient_id=` 필터를 "본인 것만 보임"으로 표현하되 기밀 보장으로 과장하지 않음 — 일치.
- 상태 4색 매핑(UX-DR2)·슬롯 피커 3상태(UX-DR3)가 에픽의 UX-DR 인벤토리와 1:1 대응.

### Alignment Issues

- **없음(블로킹).** UX ↔ PRD ↔ Architecture 삼자 정합. UX-DR1~11이 에픽 스토리 AC에 매핑돼 있어 구현 추적 가능.

### Warnings (경미 · 비블로킹)

- ⚠️ **[ASSUMPTION] 미확정 토큰:** primary teal `#0E7490`와 본문 폰트 Pretendard가 `[ASSUMPTION]` 태그. "검토 시 확정"으로 표기됨 — 화장품(cosmetic) 수준 리스크라 구현 착수를 막지 않으나, 착수 전 1분이면 확정 가능. 확정 권장.
- ⚠️ **문서 라벨 vs 상태:** 두 스파인 모두 본문은 "초안(Fast path)"이라 자칭하나 frontmatter `status: final`. 내용은 완결돼 있어 실질 문제는 없음 — 라벨만 정리하면 깔끔.
- ℹ️ walk-in(P1)이 UX에서 이미 충분히 명세됨 — P1임에도 갭 없이 준비돼 있어 오히려 강점.

---

## Epic Quality Review

`create-epics-and-stories` 모범 사례 기준 엄격 검토. 대상: 5 Epics / 15 Stories(`epics.md` 완독본).

### A. 에픽 구조 — 사용자 가치 & 독립성

| Epic | 사용자 가치? | 기술 마일스톤 함정? | 독립성(N은 N+1 불요) |
|------|----|----|----|
| Epic 1 진입 & 환자 관리 | ✅ 역할 선택·환자 등록/검색(사용자 행동) | ⚠️ 걷는 뼈대(스캐폴딩·배포·마이그레이션) 번들 — 그러나 사용자 가치(환자 등록)로 감싼 **정당한 walking-skeleton** | ✅ 단독 성립 |
| Epic 2 예약 | ✅ 환자 예약·직원 관리 | 없음 | ✅ Epic 1만으로 동작(Epic 5 불요 — §deferral) |
| Epic 3 진료 기록 | ✅ 의사 기록·처방 | 없음 | ✅ Epic 1·2 산출물만 사용 |
| Epic 4 조회 | ✅ 환자/직원 이력 조회 | 없음 | ✅ P0 한 줄기 닫음 |
| Epic 5 가용성·Walk-in (P1) | ✅ 충돌 차단·자동배정·walk-in | 없음 | ✅ Epic 1–4 뒤 착수(후방 의존, 게이트 명시) |

- **순수 기술 에픽: 없음.** "Setup DB"·"API Development" 류 없음. Epic 1이 인프라를 담되 첫 화면에서 시드 진료과가 3-tier 관통해 렌더되는 **사용자 확인 가능 산출물**로 마감 → 합격.

### B. 전방 의존성(Forward Dependency) 분석 — 핵심 관문

- **위반 없음.** Story 2.1·2.3이 Epic 5(FR-15 충돌검사·재배정 재검사)를 `↪` 노트로 참조하지만, **"P0에서는 검사 없이 생성/갱신한다"고 명시**해 Epic 2가 Epic 5 없이 완결됨. 이는 전방 의존이 아니라 **범위 경계 주석**(P0/P1 분리)이라 오히려 모범적.
- Epic 5는 "Epic 1–4가 배포 URL에서 시연된 뒤에만 착수"라는 **착수 게이트**를 명시 — 후방 의존만 존재. 순환 의존 없음.
- 스토리 내 의존도 후방만(1.4가 1.3의 `GET /patients` 재사용, 3.x가 2.x 확정 예약 사용). 정상.

### C. 스토리 크기 & AC 품질

- **AC 형식:** 15개 스토리 전부 Given/When/Then BDD. 엔드포인트·상태코드·DB 제약까지 구체적 → **테스트 가능·측정 가능**. 매우 높은 품질.
- **오류 경로 커버:** 2.1(의사 미선택 인라인)·2.2(취소 확인 Dialog)·3.1(비확정 예약 4xx 거부 + 중복기록 부분유니크 차단)·3.2(약 미선택 인라인)·5.1(충돌 4xx)·5.2(빈 의사 없음 거부)·5.3(빈 의사 없음 red Dialog). Happy/에러 양쪽 완비.
- **크기:** 대부분 적정. Story 1.1a만 무거움(스캐폴딩+마이그레이션 3종+시드+역할선택+수직 슬라이스) — 단, walking-skeleton은 본질상 end-to-end라야 하고 이미 1.1a(로컬)/1.1b(배포)로 분리해 완화. 허용 범위.

### D. 스타터 템플릿 & 그린필드 요건

- ✅ **스타터 우선:** 아키텍처가 스타터 지정(Next.js `create-next-app`+shadcn/Tailwind, FastAPI+psycopg 3) → Story 1.1a가 "monorepo 생성·`lib/api.ts`·`next dev`/`uvicorn`"로 정확히 스타터-설정 스토리 역할.
- ✅ **배포 조기화:** 1.1b를 "1일차 종료 전 완료" 게이트로 강제 — 그린필드 배포 리스크를 앞으로 당김(모범).

### E. DB/엔티티 생성 타이밍 (체크리스트 명시 항목)

- 9개 테이블은 **에픽 이전 산출물**(ERD 설계 단계, 이미 Supabase 배포됨). 따라서 "Epic 1이 모든 테이블을 선(先)생성" 안티패턴은 **엄밀히는 부재** — 에픽에는 테이블 생성이 없고 제약/보안 마이그레이션(RLS·부분유니크·CHECK)+시드만 있음.
- 🟡 **경미 관찰:** 마이그레이션 `002_uq_record`(부분유니크)는 Epic 3에서, `003_reserved_at_check`는 Epic 2에서 **처음 필요**하지만 셋 다 Story 1.1a에 배치됨. 엄격한 just-in-time 대비 살짝 "선(先)적용". **단, 정당함** — RLS는 배포(NFR-4 게이트) 전 반드시 ON이어야 하고, DB 베이스라인을 1회 마이그레이션 패스로 세우는 편이 3일 일정·단일 개발자에 유리. 데이터 모델 중심 교육 과제라 정규화 스키마 선(先)확정은 의도된 설계. → **위반 아님, 트레이드오프 기록.**

### F. 심각도별 정리

**🔴 Critical Violations:** 없음.

**🟠 Major Issues:** 없음.

**🟡 Minor Concerns (권고 · 비블로킹):**
1. **Story 1.1a 부하** — 1일차에 스캐폴딩+DB 베이스라인+수직 슬라이스가 몰림. 이미 1.1a/1.1b 분리로 완화됐으나, 착수 시 시간 배분 주의(배포 1.1b가 1일차 밀리지 않게).
2. **마이그레이션 선적용** — 002/003이 최초 필요 시점보다 앞서 배치(§E). 정당하나, 원한다면 002는 Epic 3, 003은 Epic 2로 옮겨 순수 just-in-time으로 만들 수 있음(선택).
3. **CI/CD 스토리 부재** — 3일 단독 교육 과제라 Vercel/Railway 수동 배포로 충분. 형식 파이프라인은 과잉. 현 상태 유지 권장.
4. **[ASSUMPTION] 디자인 토큰** — Story 1.1a의 토큰 설정 AC가 미확정 primary/폰트에 의존(§UX 경고 재게시). 착수 전 확정 권장(1분).

### G. 모범 사례 준수 체크리스트

- [x] 에픽이 사용자 가치 전달
- [x] 에픽 독립 동작(전방 의존 없음)
- [x] 스토리 적정 크기
- [x] 전방 의존성 없음(P0/P1 경계 주석으로 명확)
- [x] DB 테이블은 필요 시 생성(스키마는 선행 산출물 — 정당한 예외)
- [x] 명확·테스트 가능 AC(전 스토리 GWT)
- [x] FR 추적성 유지(Coverage Map + 스토리별 FR 태그)

**종합:** 에픽/스토리 구조는 **구현 착수 가능(implementation-ready)**. 🔴/🟠 결함 0건, 🟡 경미 4건은 모두 착수를 막지 않는 권고 수준.

---

## Summary and Recommendations

### Overall Readiness Status

## ✅ READY (구현 착수 가능)

PRD · UX(DESIGN+EXPERIENCE) · Architecture 스파인 · Epics/Stories 4개 아티팩트가 서로 정합하며, 요구사항이 빠짐없이 추적 가능한 스토리로 내려가 있음. 착수를 막는 🔴 Critical / 🟠 Major 결함은 **0건**. 발견된 4건은 모두 🟡 경미(권고) 수준.

**준비도 근거(증거 기반):**
- **FR 커버리지 16/16 (100%)**, **NFR 5/5 (100%)** — 누락·유령 요구 없음.
- **삼자 정합(UX↔PRD↔Architecture)** — AD-1/4/5/6/8/10이 UX 행동 규칙과 1:1 대응.
- **전방 의존성 위반 0건** — P0/P1 경계를 `↪` 주석·Epic 5 착수 게이트로 명확히 분리.
- **전 15개 스토리 Given/When/Then AC** — happy path + 오류 경로(도메인 거부·4xx·인라인 검증) 완비.
- **walking-skeleton + 배포 1일차 게이트** — 그린필드 배포 리스크를 앞으로 당김.

### Critical Issues Requiring Immediate Action

- **없음.** 즉시 조치가 필요한 🔴/🟠 이슈는 발견되지 않음.

### Recommended Next Steps

1. **(1분·착수 전) 디자인 토큰 확정** — DESIGN.md의 `[ASSUMPTION]` primary teal `#0E7490`·본문 폰트 Pretendard를 확정으로 승격. Story 1.1a의 토큰 설정 AC가 여기에 의존.
2. **(1일차) Story 1.1a → 1.1b 순서 사수** — 스캐폴딩·DB 베이스라인(RLS·부분유니크·CHECK 마이그레이션 + 시드)을 세운 뒤 **배포(1.1b)를 1일차 종료 전 완료**. 배포·RLS 실증을 뒤로 미루지 말 것(브리프 리스크).
3. **(선택·순수주의) 마이그레이션 배치 재고** — 원한다면 `002_uq_record`를 Epic 3, `003_reserved_at_check`를 Epic 2로 이동해 just-in-time으로 정렬. 현 배치(1.1a 일괄)도 정당하므로 필수 아님.
4. **(문서 위생) 스파인 라벨 정리** — DESIGN/EXPERIENCE 본문의 "초안(Fast path)" 표기를 `status: final`과 일치시키거나, 남은 `[ASSUMPTION]`을 해소 후 제거.
5. **(P0 우선) 가드레일 준수** — Epic 1→2→3→4로 P0 한 줄기(등록→의사 직접선택 예약→확정→기록→조회)를 배포 URL에서 관통시킨 뒤에만 Epic 5(P1)에 착수. Epic 5 착수 게이트를 실제 실행 순서로 지킬 것.

### 구현 착수 시 특히 주의할 정합 지점 (아키텍트 노트)

- **FR-8 완료 전이(AD-5):** 진료 기록 저장과 예약 `완료` 전이를 **같은 트랜잭션**에서 처리(Story 3.1). 두 쓰기를 분리하지 말 것.
- **FR-15 충돌원(AD-4):** 충돌 소스가 `appointment` ∪ walk-in `medical_record` **두 테이블**에 걸쳐 단일 DB 제약으로 못 막음 → `check_and_occupy` 단일 관문(Story 5.1)으로만. 정직한 경계(TOCTOU 미보장)를 UI 문구에 반영.
- **AD-6 이력 불변:** `medical_record`는 작성 시점 `hospital_department_id`·`doctor_id`를 **복사 저장**(라이브 조인 금지).
- **NFR-4 완료 정의:** 배포 후 Supabase advisor로 **9테이블 RLS ON** 실증 + RLS ON 상태에서 FastAPI 시드 읽기 정상 반환 확인(Story 1.1b) — "어디서나 빈 목록" 실패 차단.

### Final Note

본 평가는 **5개 카테고리(문서 인벤토리·PRD·에픽 커버리지·UX 정합·에픽 품질)**에 걸쳐 총 **4건의 경미(🟡) 이슈**를 식별했으며, **Critical·Major 이슈는 0건**이다. 4건 모두 구현 착수를 막지 않는 권고 수준이므로, 위 디자인 토큰 확정(1분)만 처리하면 **그대로 Phase 4 구현에 진입 가능**하다. 아티팩트를 더 다듬을 수도, 현 상태로 진행할 수도 있다.

---

*Assessor: Winston (System Architect) · Date: 2026-07-13 · Method: BMad Implementation Readiness (6-step)*

---

## Post-Assessment Resolution (2026-07-13)

평가 직후 🟡 Minor 이슈 중 2건을 해소함:

- **[해소] 디자인 토큰 확정** — DESIGN.md의 `[ASSUMPTION]` 2건을 확정으로 승격.
  - **primary 색:** teal `#0E7490` → **emerald `#047857`**(emerald-700). 사용자 선택은 emerald-600 `#059669`였으나 흰 버튼 텍스트 대비가 3.8:1로 **WCAG AA(4.5:1) 미달**이라, 초록 방향을 유지하되 AA를 통과하는 emerald-700(5.5:1)로 확정. 전파 완료: DESIGN.md, epics.md(UX-DR1·Story 1.1a AC), mockups/booking.html·record.html.
  - **본문 폰트:** Pretendard 확정(한글 웹 UI 표준).
  - **신규 가드레일:** primary emerald가 상태색 '완료=green'과 계열 인접 → primary는 채도 높은 fill(버튼·크롬)로만, 상태 green은 연한 배지로만, 교차 사용 금지 + 배지 한국어 텍스트 병기로 구분 보장(DESIGN.md에 명시).
- **[해소] 스파인 라벨 정리** — DESIGN.md·EXPERIENCE.md의 "초안(Fast path)"·`[ASSUMPTION]` 표기 제거, `status: final`과 일치시킴.

*미해소(의도적 보류):* Minor #2(마이그레이션 002/003 선적용 — 정당하므로 현 배치 유지), Minor #1·#3(Story 1.1a 부하·CI/CD 부재 — 현 상태 적정). `.memlog.md`(이력 로그)와 `.working/`(스크래치)의 옛 색 문자열은 이력 보존을 위해 그대로 둠.

