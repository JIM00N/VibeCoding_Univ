---
paths:
  - "backend/**"
---

# backend 규칙 (FastAPI + psycopg3 raw SQL)

## 계층 (신규 엔드포인트는 4개 파일을 건드린다)

`routers/` → `services/` → `db/` + `schemas/`. 네 디렉토리가 같은 도메인 모듈명을 공유한다
(`appointments` · `availability` · `medical_records` · `patients` · `refdata`). 그 외 `db/pool.py`(커넥션 풀), `app/slots.py`(슬롯 계산).

- `routers/` HTTP 경계 — 요청/응답만, 도메인 판단 금지
- `services/` 도메인 규칙·상태 전이·404/409 매핑
- `db/` SQL I/O 전용. ORM 없음, 모든 쿼리는 파라미터 바인딩(`%s` / `%(name)s`)
- `schemas/` Pydantic 계약

## 실행 (반드시 `backend/` 안에서)

`app/config.py`의 `load_dotenv()`가 **CWD 기준**이라 레포 루트에서 돌리면 `.env`를 못 찾고 죽는다:
`RuntimeError: DATABASE_URL 이 설정되지 않았습니다`.

```bash
uv run --with-requirements requirements-dev.txt --no-project python -m pytest -q   # 테스트
uv run --with-requirements requirements-dev.txt --no-project ruff check .          # 린트
uv run --with-requirements requirements.txt --no-project python -m uvicorn app.main:app --port 8000
```

시스템 `python3`은 3.11이고 pytest가 없다 — **항상 uv 경유.** venv 없음.

## 린터 (ruff)

`ruff.toml`은 **버그 계열만** 켠다(`E4 E7 E9 F B ASYNC UP`). 현재 검출 **0건**이므로 경고가 뜨면 전부 새로 생긴 것이다.

- `--fix`를 습관적으로 돌리지 않는다. 0건 상태에선 고칠 게 없고, 이 레포는 전체 재포맷을 금지한다.
- 룰을 넓히기 전에 실측부터 한다 — 기본 룰셋은 26건, `E501`은 436건, `S101`은 330건이 뜨는데 전부 이 코드베이스에선 소음이다.
- `S608`(하드코딩 SQL) 7건은 **검증된 오탐**이다(아래 조각 빌더 절 참고). 켜면 영구 `# noqa` 세금만 생기고 리터럴/런타임 인자를 구분하지 못해 가드 역할도 못 한다.
- 포매터는 여전히 없다 — `ruff format` 도입도 별도 결정 사항이다.

## 환경변수

| 키 | 필수 | 비고 |
|---|---|---|
| `DATABASE_URL` | ✅ | 없으면 `RuntimeError`. Session 풀러(`…pooler.supabase.com:5432`)만 쓴다 — 직접 호스트는 IPv6 전용이라 안 붙는다 |
| `CORS_ORIGINS` | | 기본 `http://localhost:3000` |
| `CORS_ORIGIN_REGEX` | | Vercel 프리뷰 등 동적 서브도메인용 |

## SQL 조각 빌더 — 리터럴만 넘긴다 ⚠️

`availability.py`의 `slot_taken_sql` · `free_doctor_sql` · `occupied_sources_sql`은 SQL **구조**를 f-string으로 조립한다.
현재 호출부 6곳이 전부 모듈 스코프 + 문자열 리터럴 인자라 안전하고, SQL 텍스트는 import 시점에 굳는다.

**이 안전성은 "호출자가 리터럴을 넘긴다"는 관례에만 기대고 있다 — 강제하는 장치가 없다.**
런타임에서 유도된 값(요청 파라미터·DB에서 읽은 값·f-string으로 만든 식)을 인자로 넘기면
그 즉시 예약 충돌 게이트에 직접적인 SQL 구조 주입이 된다. 새 호출자를 추가할 땐 인자가 소스 리터럴인지 반드시 확인한다.
(Story 5.3 워크인이 네 번째 호출자를 추가하기로 예정돼 있다.)

값은 항상 psycopg 플레이스홀더로 바인딩한다(`%s` / `%(name)s`). 식별자·컬럼 참조만 정적으로 조립한다.

## 확인 · 함정

- **`/health`는 DB를 안 건드린다.** DB 연결 확인은 `GET /departments`로 한다.
- 커넥션 풀은 `lifespan`에서 열린다 — `DATABASE_URL`이 틀리면 첫 요청이 아니라 **기동 시점에** 죽는다.
- 포트는 5432(Session) 고정. 6543(Transaction)은 psycopg3 prepared statement와 충돌한다.
- `app/slots.py`는 **naive datetime을 UTC로 간주**하는 계약이다(`ensure_utc`·`to_slot`). 테스트가 이 동작을 명시적으로 검증하므로 naive datetime 생성을 "버그"로 고치지 않는다.
- 포매터 없음(black·prettier 등 전무). 임의 도입·전체 재포맷 금지 — 스타일은 기존 코드 관례를 따른다.
- 계약 테스트는 db 계층을 monkeypatch한다 → **실 SQL 회귀를 못 잡는다.** 실 보증은 curl 실증·라이브 실측이 담당(`.claude/rules/workflow.md`).
