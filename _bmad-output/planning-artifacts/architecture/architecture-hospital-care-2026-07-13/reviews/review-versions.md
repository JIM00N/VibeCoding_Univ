# Version / Reality Review — hospital-care ARCHITECTURE-SPINE

- **Reviewed:** `ARCHITECTURE-SPINE.md` (Stack table + Design Paradigm)
- **Date of review:** 2026-07-13 (as-of mid-2026)
- **Method:** WebSearch reality-check of each named technology against current releases
- **Verdict:** **VERSIONS-OK** — every named version exists and is current-enough for a 3-day project. One HIGH runtime gotcha (psycopg3 + Supabase transaction-mode pooler) is missing from the spine and will break the app on first query unless one config flag is set.

---

## Stack table — item-by-item

### Next.js (App Router) 16.2.x — ✅ CURRENT
- 16.2 shipped **2026-03-18**; the 16.2.x line is the current stable in mid-2026 (latest patch ~16.2.7 as of June 2026). 16.3 exists as a newer minor (Turbopack persistent cache, Rust React Compiler) but 16.2.x is fully supported and a safe pin. **No change needed.**
- Beginner gotchas (both are defaults, not problems, but worth a one-line note in the spine):
  - **Turbopack is the default bundler** for both `next dev` and `next build` in Next 16 (no flag needed; webpack is now the legacy opt-out). Zero-config for this app — fine.
  - **React 19.2 ships bundled** with Next 16 (Next 16 requires React ≥19.1). So the React 19.2 row is automatically satisfied by `create-next-app` — the two rows are consistent.

### React 19.2 — ✅ CURRENT
- 19.2 released **2025-10-01**; latest patch ~19.2.7 as of July 2026. Consistent with Next 16's bundled React. **No change needed.**

### FastAPI 0.136.x — ✅ EXISTS / recent, slightly behind head
- 0.136.x is real (0.136.1 released 2026-04-23; 0.136.3 packaged). It is a valid, stable pin. Current head is **0.139.0** (2026-07-01), i.e. the spine is ~3 minor versions behind head but that is immaterial for a 3-day project — FastAPI minors are additive/non-breaking. **No change required;** optionally pin the newest at install time.
- **Python "3.12+" claim — technically over-stated but safe.** FastAPI 0.136 only *requires* Python **3.10+**. Choosing 3.12+ is a sound, well-supported choice (not wrong), just not a FastAPI-imposed floor. Keep 3.12+ if you like; just know it's your choice, not a driver requirement.

### psycopg 3.x (Postgres driver) — ✅ SOUND choice, ⚠️ POOLER CAVEAT MISSING (HIGH)
- psycopg 3 is a sound, current, well-maintained choice for FastAPI + raw parameterized SQL (matches AD-2/AD-4's "real transactions + joins" intent better than supabase-py). **The driver choice is good.**
- **Gotcha the spine does not mention and a beginner WILL hit:** the spine says the backend uses the Supabase **connection-pooler URL** as `DATABASE_URL` (Structural Seed → 배포·환경). Supabase's pooler (Supavisor) in **transaction mode (port 6543)** hands each transaction a different server connection, so **server-side prepared statements are not safe** — psycopg3 auto-prepares after a few executions and you get intermittent `prepared statement "_pg3_..." does not exist` / `already exists` errors under any repeat query load.
  - **Fix (one line):** create the psycopg connection/pool with **`prepare_threshold=None`** (disable auto-prepare). This is the psycopg3-native equivalent of the pgbouncer prepared-statement workaround.
  - **Alternative:** use the pooler in **session mode** (port 5432 via pooler) or the direct connection, both of which support prepared statements — but for a demo the transaction-mode pooler + `prepare_threshold=None` is the standard combo.
  - **Action:** add a note to the Stack table / Consistency Conventions ("시크릿·설정" row) that `DATABASE_URL` points at the transaction-mode pooler AND that psycopg must set `prepare_threshold=None`. Without this the app compiles and demos fine on the first click, then fails intermittently — the worst failure mode for a Thursday deadline.

### PostgreSQL (Supabase, project fphsxoweprztrekckzui) — ✅ N/A (managed, live schema)
- Managed; version is Supabase's concern. AD-9's "deployed schema is baseline" is the right posture. No version claim to check.

### Deploy: Railway — ✅ STILL STANDARD in 2026
- Railway remains a standard target for a Next.js service + a FastAPI (uvicorn) service. There is even an official **Next.js + FastAPI full-stack starter template** (created 2026-04-03) and current FastAPI-on-Railway guides. `railway.json` with `startCommand: uvicorn app.main:app --host 0.0.0.0 --port ${PORT}` (as the spine implies) is the current idiom. **No change needed.**
  - Minor beginner reminder (not a version issue): bind uvicorn to `$PORT` (Railway injects it) and set CORS on the backend to the frontend's Railway origin — both already implied by AD-1/AD-10 and the ops diagram.

---

## Summary of findings

| # | Severity | Item | Finding | Action |
|---|----------|------|---------|--------|
| 1 | **HIGH** | psycopg3 + Supabase pooler | Transaction-mode pooler + psycopg3 auto-prepared statements → intermittent runtime errors. Not mentioned in spine. | Set `prepare_threshold=None` on the psycopg connection/pool; document in Stack/Conventions. |
| 2 | LOW | FastAPI Python floor | Spine says "Python 3.12+"; FastAPI only requires 3.10+. 3.12+ is a fine choice, not a requirement. | Optional clarify wording; no real fix. |
| 3 | LOW | FastAPI version | 0.136.x is valid but ~3 minors behind head (0.139.0, Jul 2026). | Optional: pin latest at install. No functional impact. |
| 4 | INFO | Next.js 16 / React 19.2 | Both current and mutually consistent (React 19.2 bundled with Next 16; Turbopack default). | Optionally note "Turbopack is default" so beginner isn't surprised. |
| 5 | INFO | Railway | Still standard; official Next.js+FastAPI template exists. | None. |

**Bottom line:** No version is out-of-date, nonexistent, or a broken pairing. Every decision reflects mid-2026 reality. The only thing that can bite this specific project is the psycopg3/transaction-pooler prepared-statement caveat (finding #1) — cheap to fix, expensive to debug at the deadline, so add it to the spine now.
