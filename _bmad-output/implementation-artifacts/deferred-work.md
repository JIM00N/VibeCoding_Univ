# Deferred Work

## Deferred from: code review of 1-1-로컬-수직-슬라이스 (2026-07-14)

- **⚠️ 시드 재실행 데이터 유실 (Epic 2 착수 전 필수 처리)** — `db/seed/004_seed.sql`의 `truncate ... restart identity cascade`가 참조 테이블뿐 아니라 `appointment·medical_record·prescription`까지 비운다. 지금은 트랜잭션 데이터가 0행이라 무해하나, Epic 2부터 UI로 만든 예약·진료 데이터가 있는 상태에서 재시드하면 공유 DB에서 삭제된다. 예약 기능(Story 2.1) 착수 전에 결정: (a)데모 리셋 유지+경고 주석 (b)truncate 없이 idempotent upsert (c)비어있을 때만 시드. [db/seed/004_seed.sql]
- **to_slot() tz 전제** — `to_slot()`은 UTC로 floor하고 DB CHECK는 세션 tz의 `extract(minute)`를 쓴다. 정시 오프셋(KST/UTC)에선 동일하나 비정시 오프셋(예: +5:45)으로 배포하면 어긋난다. AD-3에 문서화됨. 배포 tz가 바뀌면 재검토. [backend/app/slots.py, db/migrations/003_reserved_at_check.sql]
- **인프라 오류 → 한국어 {detail} 전역 핸들러** — DB 다운/풀 타임아웃 시 FastAPI 기본 500(영문)이 나가고 클라이언트가 한국어 폴백을 보여준다. AD-10 계약을 인프라 오류까지 확장하는 전역 예외 핸들러는 배포 하드닝(Story 1.2)에서. [backend/app/routers, backend/app/db/pool.py]
- **fetch_departments hospital 필터** — 진료과 조회 SQL에 `where hd.hospital_id = ...`가 없어 다병원이 시드되면 진료과가 섞인다. 단일 병원 전제에선 정확. 다병원 도입 전 필터 추가. [backend/app/db/refdata.py]
- **RLS 비소유자 역할 시 빈 결과** — deny-by-default라 백엔드가 소유자(postgres) 역할이 아니면 조용히 `[]`를 반환한다. 현재 세션 풀러 소유자 역할로 실증됨. 향후 최소권한 역할로 바꾸면 명시적 정책/GRANT 필요. [db/migrations/001_rls.sql]
