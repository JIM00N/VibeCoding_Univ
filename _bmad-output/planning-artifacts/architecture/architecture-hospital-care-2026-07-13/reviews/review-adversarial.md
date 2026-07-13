---
title: Adversarial Architecture Review — hospital-care Spine
type: architecture-review
method: adversarial (two-unit divergence attack)
target: ARCHITECTURE-SPINE.md (2026-07-13)
reviewer: adversarial architecture reviewer
created: '2026-07-13'
verdict: HOLES-FOUND
schema_ground_truth: 'Supabase fphsxoweprztrekckzui (live introspection 2026-07-13)'
---

# Adversarial Review — hospital-care Architecture Spine

**Verdict: HOLES-FOUND** (1 CRITICAL, 4 HIGH, 3 MEDIUM, 1 LOW)

Attack model: for each finding I construct **two units built one level down** — usually two builders/sessions
implementing two different services or screens — that **each obey every AD to the letter** yet build
**incompatibly**. Each such pair is a hole to close with a new or tightened AD.

Ground-truth was verified against the live deployed schema (`fphsxoweprztrekckzui`), not just the docs. Key
confirmed facts used below:

- **All 9 PKs are `GENERATED ALWAYS AS IDENTITY`** (not merely "identity"). Explicit-id inserts are rejected by Postgres.
- **All 3 "pending" migrations are genuinely not applied:** RLS is OFF on all 9 tables; there is **no** partial
  unique index on `medical_record(appointment_id)` (only a plain **non-unique** `medical_record_appointment_id_idx`);
  there is **no** 30-min grid CHECK on `appointment.reserved_at` (only the `status` CHECK and NOT NULL checks exist).
- `hospital_department` **already** has `UNIQUE(hospital_id, department_id)` — the department→hospital_department
  mapping is DB-unambiguous (this eliminated one candidate finding).
- `medical_record.doctor_id`, `.hospital_department_id`, `.visited_at` are all **NOT NULL**;
  `appointment.doctor_id` is **nullable**, `appointment.hospital_department_id` is **NOT NULL**. Matches the spine's claims.

---

## CRITICAL

### C1 — Slot comparison is unrealizable as written: `to_slot()` is Python, the union check lives in SQL, and `visited_at` storage form is unpinned (AD-3, AD-4)

**The gap.** AD-3 mandates "exactly one implementation" of `to_slot()` and lives it in `backend/app/slots.py`
as a **Python pure function** (Structural Seed). But AD-4's conflict source is the **union of two DB tables**
(`appointment.reserved_at` where status ∈ 대기·확정, ∪ walk-in `medical_record.visited_at` where
`appointment_id` is null), keyed by `(doctor_id, slot)`. **A Python function cannot be called inside that SQL
union.** The spine never says how the slot comparison is realized against the database, and it never pins whether
`medical_record.visited_at` is stored as **raw `now()`** or as the **floored slot value**. AD-3 says "walk-in
`visited_at`은 floor" / A4 says "현재 시각을 속한 슬롯으로 내림(floor)해 **슬롯 키를 만든다**" — which reads as
"floor to make the key," i.e. store raw, floor at compare time. Both readings are defensible.

**Two units that each obey AD-3 + AD-4 yet clash:**

- **Unit-Appointment** (`services/availability`, builds `check_and_occupy`) realizes the union in SQL with
  **exact equality** against the slot boundary, trusting the reserved_at grid CHECK and assuming aligned keys:
  `... WHERE doctor_id=:d AND reserved_at = :slot_start UNION ... WHERE doctor_id=:d AND appointment_id IS NULL AND visited_at = :slot_start`.
- **Unit-Walkin** (`services/records`, FR-16) stores `visited_at = now()` **raw** (10:17:33) — the natural,
  AD-3-consistent reading ("floor to make the key," not "floor to store"). It calls `to_slot()` in Python only to
  derive the key it passes in.

**Divergence / failure scenario.** A walk-in for doctor D at 10:17:33 is stored with `visited_at = 10:17:33+09`.
A patient then books D at 10:00. `check_and_occupy(D, 10:00-slot)` runs the union with
`visited_at = '10:00:00'` → `10:17:33 ≠ 10:00:00` → **no conflict found → reservation succeeds on an
already-occupied (doctor, slot).** This is **precisely the "walk-in fails to actually block a reservation"
failure AD-3 exists to prevent**, and both builders satisfied AD-3/AD-4 verbatim. The single-`to_slot()` and
single-`check_and_occupy` rules do **not** save you, because the break is in (a) SQL realization of a Python key
and (b) the unpinned storage form of `visited_at`. Note this is worsened today because migration-3 (reserved_at
grid CHECK) is still unapplied, so even `reserved_at` may hold non-grid values.

**Close it.** Tighten AD-3/AD-4 to pin all of:
1. `visited_at` (and `reserved_at`) are stored **raw timestamptz**; the slot is **never** stored.
2. The conflict comparison is realized **one way only** — recommended: a **SQL-side expression** the spine names
   explicitly, e.g. `date_bin('30 minutes', ts, TIMESTAMPTZ 'epoch')` (UTC-anchored), used identically on both
   union branches; and `to_slot()` in Python must be defined to return the **same** boundary
   (`date_bin` equivalent) so Python-side keying and SQL-side keying are provably identical. Forbid exact-equality
   comparison of raw timestamps. (Alternative: a single SQL `to_slot(ts)` IMMUTABLE function is the true "one
   implementation," and Python calls it or mirrors it — but then AD-3's "lives in slots.py" wording is wrong and
   must change.)

---

## HIGH

### H1 — "Check + insert in one transaction" is not threadable as specified across the availability↔records boundary (AD-2, AD-4, AD-5)

**The gap.** AD-4 requires the conflict check and the occupying insert to run "in the **same** transaction," and
AD-2 says `services` own the transaction boundary while **only `db` opens connections**. But `check_and_occupy`
lives in `services/availability`, whereas the walk-in insert lives in `services/records` and the appointment
insert in `services/availability`/`appointments`. **Nothing pins how the shared transaction/connection is threaded
between the checking function and the inserting caller.**

**Two units that each obey AD-2 + AD-4 yet clash:**

- **Unit-A** designs `check_and_occupy(conn, doctor_id, slot)` to **accept the caller's connection/cursor**, so
  the caller's `with conn.transaction():` block wraps both check and insert. Same tx. Correct.
- **Unit-B** designs `check_and_occupy(doctor_id, slot) -> bool` as **self-contained** (asks the `db` layer for a
  connection, checks, returns True/False, connection closed). The caller then opens a **separate** transaction to
  insert. Both "call the single `check_and_occupy` before every occupying write" (AD-4 satisfied verbatim), and
  both keep connection-opening in `db` (AD-2 satisfied).

**Divergence / failure scenario.** Under Unit-B the check and the insert are in **two different transactions**, so
the TOCTOU window AD-4 claims to "완화 (mitigate) within a single session" is **reopened even in a single session**
(e.g. two sequential requests from the same staff tab, or a retry): request 1 checks free, request 2 checks free,
both insert → double-occupancy. Worse, the same threading ambiguity applies to AD-5's "record-create + status→완료
in the same tx": if `check_and_occupy` and the `medical_record` insert and the `appointment` status update are not
provably in one tx, you can get an inserted record with the appointment left at 확정 (orphan completion state) on a
partial failure.

**Close it.** Tighten AD-2/AD-4/AD-5: the transaction is owned by the **calling service**, and every occupancy/
completion helper (`check_and_occupy`, record-create, status transition) **must accept and operate on the caller's
connection/cursor** — no helper may open its own connection. State the exact psycopg pattern
(`with pool.connection() as conn: with conn.transaction(): ...`, helpers take `cur`).

### H2 — One entity, two JSON shapes: AD-10 pins the envelope but not the per-resource schema (AD-10, AD-8)

**The gap.** AD-10 pins the success **envelope** (raw Pydantic, no wrapper), the **error** shape (`{"detail":...}`),
and the **time format** (ISO-8601 UTC) — and requires a single `lib/api.ts`. It does **not** pin the **field
schema** of shared entities per endpoint, nor whether relations are returned as **FK ids** or **expanded objects**.

**Two units that each obey AD-10 yet clash:**

- **Unit-Patient** (`patient/` screens) returns an appointment **flat with FK ids**:
  `{id, patient_id, doctor_id, hospital_department_id, reserved_at, status}`.
- **Unit-Staff** (`staff/` screens) needs to render doctor **names** and department **names** in a management
  table, so it returns appointments **expanded**:
  `{id, patient:{id,name}, doctor:{id,name}, department:{id,name}, reserved_at, status}`.

Both are raw Pydantic models, no envelope, ISO times — **fully AD-10-compliant**.

**Divergence / failure scenario.** The single `lib/api.ts` now has to represent **two mutually incompatible
`Appointment` types**: `doctor_id: number` vs `doctor: {name:string}`. There is no one TypeScript type; the "single
client" invariant AD-10 exists to protect is broken, and a shared component that reads `appt.doctor_id` throws on
the staff payload (and vice-versa). A second flavor of the same bug: because `appointment.doctor_id` is
**DB-nullable but app-always-filled**, Unit-Patient models it `doctor_id: int` while a defensive Unit-Staff models
`Optional[int]` — the frontend type and null-handling diverge, and Unit-Patient's model will even raise a Pydantic
serialization error if it ever meets a legitimately null-doctor row.

**Close it.** Add/extend AD-10 with a **shared schema registry**: one canonical Pydantic model per entity
(`AppointmentOut`, `DoctorOut`, …), relations returned as **FK ids by default**, expansion only via an explicit,
named, additive field (e.g. `doctor: DoctorOut | None` populated only on documented list endpoints) that
`lib/api.ts` types once. Pin `doctor_id: int | None` consistently (schema is the source of truth).

### H3 — `GENERATED ALWAYS AS IDENTITY` breaks any explicit-id insert; "bigint identity" doesn't say which (AD-9)

**The gap.** AD-9 says PKs are "**bigint (정수) identity**." The live schema is stronger: **`GENERATED ALWAYS AS
IDENTITY` on all 9 tables** (verified). Postgres **rejects** any INSERT that supplies `id` for such columns
("cannot insert a non-DEFAULT value into column \"id\"") unless the statement uses `OVERRIDING SYSTEM VALUE`. AD-9
never states ALWAYS-vs-BY-DEFAULT.

**Two units that each obey AD-9 yet clash:**

- **Unit-Seed** (`db/seed/004_seed.sql`, P0) wires FKs deterministically with **explicit ids** — the standard way
  to author referential seed data: `insert into department(id,name) values (1,'내과'); insert into
  hospital_department(id,hospital_id,department_id) values (1,1,1); insert into doctor(id,hospital_department_id,
  name) values (10,1,'김의사');`. This is normal "version SQL migration" work (AD-9-compliant).
- **Unit-App-Insert** writes `INSERT INTO patient (id, name) VALUES (...)` or a repository that includes `id`.

**Divergence / failure scenario.** Both fail at runtime against the deployed schema: the **P0 seed migration
errors on the first explicit-id row**, blocking the demo data that FR-13/14 and every downstream screen depend on
— on **day 1**, exactly when the spine says to stand up the deploy skeleton + migrations early. Meanwhile a builder
who wrote seeds with `DEFAULT` ids + `RETURNING`/CTE wiring succeeds, so the two seed authorings are incompatible
and only one deploys.

**Close it.** Add to AD-9: PKs are `GENERATED ALWAYS AS IDENTITY`; **no INSERT anywhere (seed or app) may supply
`id`**. Seeds wire FKs via `RETURNING`/CTEs or lookups by natural key (`department.name` is UNIQUE;
`hospital_department(hospital_id,department_id)` is UNIQUE — use those), or, if fixed ids are truly needed, via
`OVERRIDING SYSTEM VALUE` stated explicitly.

### H4 — A medical_record can be created for a 취소 (or otherwise ineligible) appointment; the partial unique index does not close it (AD-5)

**The gap.** AD-5 claims "**정상(비취소) 예약당 진료 기록 1건** — 부분 유니크 인덱스 + 앱 검사 both guarantee it."
The partial unique index (`... on medical_record(appointment_id) where appointment_id is not null`) actually
enforces "**≤1 record per `appointment_id`, regardless of status**" — it says **nothing about "non-cancelled."**
AD-5's own rule ("어떤 예약에 기록이 작성되면 완료로 전이") never states the **precondition** that the appointment
must be in {대기, 확정} to receive a record.

**Two units that each obey AD-5 yet clash:**

- **Unit-Records-Guarded** checks `appointment.status IN ('대기','확정')` before creating the record and
  transitioning to 완료.
- **Unit-Records-Literal** implements AD-5 verbatim: create record → set status='완료' in the same tx,
  unconditionally.

**Divergence / failure scenario.** A patient's appointment is **취소**. Unit-Records-Literal creates a
`medical_record` for it and flips status 취소→완료 — a **cancelled appointment is resurrected/completed**, and a
clinical record is attached to a slot that was supposed to be released. The partial unique index does **not** block
this (that appointment had no prior record; nulls are excluded so walk-ins are irrelevant here). The DB `status`
CHECK permits 취소→완료 (no transition guard exists in-DB). So the spine's stated guarantee is **false**: the index
guarantees at-most-one-per-appointment, not the "non-cancelled" scoping AD-5 attributes to it.

**Close it.** Tighten AD-5: record creation is **only permitted when `appointment.status ∈ {대기, 확정}`**; reject
otherwise with a 4xx (Korean message). State that the partial unique index enforces "one record per appointment,"
and the **status-eligibility** guard (not the index) enforces "non-cancelled." Optionally add a DB CHECK/trigger,
but at minimum pin it as a rule both writers must implement.

---

## MEDIUM

### M1 — `medical_record.hospital_department_id` source is pinned for walk-in but not for the appointment path (AD-6)

**The gap.** AD-6 pins walk-in's dept source ("배정된 의사의 **현재 소속**에서 유도"). For the **appointment-based**
record it only says "발생 시점 진료과·의사를 자체 저장" without saying **which** value: the appointment's booked
`hospital_department_id`, or the assigned `doctor.hospital_department_id` at record time. These are **independent
FKs** in the schema (verified: `appointment.hospital_department_id` and `appointment.doctor_id` are separate
columns; a doctor's `hospital_department_id` need not equal the appointment's).

**Two units that each obey AD-6 yet clash:**

- **Unit-Record-FromAppt** copies `medical_record.hospital_department_id := appointment.hospital_department_id`
  (the booked department — "발생 시점의 진료과").
- **Unit-Record-FromDoctor** copies it from `doctor.hospital_department_id` (the assigned doctor's current
  department), mirroring the walk-in rule for consistency.

**Divergence / failure scenario.** If an appointment booked under dept X is served by a doctor who belongs to dept
Y (structurally allowed; also arises if the doctor's 소속 changes between booking and visit — the exact case AD-6
exists for), the two builders write **different `hospital_department_id`** into otherwise-identical history rows.
History becomes path-dependent, defeating AD-6's immutability intent inconsistently.

**Close it.** AD-6: state the appointment-path dept source explicitly (recommend `doctor.hospital_department_id` at
record-creation time, matching walk-in, so "발생지 = 실제 진료한 의사의 그 시점 소속" is uniform), and note the
divergence case so both writers agree.

### M2 — `patient_id` transport is unpinned; "same convention" is satisfied by incompatible transports (AD-8, AD-10)

**The gap.** AD-8 requires patient-facing reads to take an "**explicit `patient_id`**" with "the same convention"
everywhere, and AD-10 says routes are plural resources — but neither pins **how** `patient_id` is transported.

**Two units that each obey AD-8 + AD-10 yet clash:**

- **Unit-Patient-Query** exposes `GET /appointments?patient_id=5` and `GET /medical-records?patient_id=5`.
- **Unit-Patient-Nested** exposes `GET /patients/5/appointments` and `GET /patients/5/medical-records`.

Both use explicit `patient_id`, both are plural-resource routes — **AD-8/AD-10-compliant**.

**Divergence / failure scenario.** `lib/api.ts` cannot have one `getAppointments(patientId)` method shape; the two
route families are incompatible and whichever the client assumes, the other unit's endpoints 404. For a solo build
this surfaces as "the patient screen's calls hit routes the backend never registered."

**Close it.** AD-8/AD-10: pin the exact transport — recommend **query param** `?patient_id=` on plural collection
routes for all patient-scoped reads — and state it once so `lib/api.ts` and the routers agree.

### M3 — AD-4 (adopted) requires FR-7 re-check, but Deferred lists "FR-7 재배정 재검사" as P1 — a direct spine self-contradiction

**The gap.** AD-4 (ADOPTED) binds FR-7 and rules "의사 변경(FR-7): 새 (doctor_id, 슬롯) 점유 확인 후 갱신." The
**Deferred** section says "FR-7 재배정 재검사 … P0 관통 후 얹음" (P1). The spine both **requires** and **defers** the
same re-check.

**Two units that each obey the spine yet clash:**

- **Unit-Appt-AD4** implements doctor-change by calling `check_and_occupy(newDoctor, slot)` then UPDATE (per AD-4).
- **Unit-Appt-Deferred** ships doctor-change as a **plain UPDATE** with no re-check (per Deferred, treating it as
  P1 not-yet-built).

**Divergence / failure scenario.** Unit-Appt-Deferred reassigns appointment from D1→D2 at a slot D2 already
occupies → **double-occupancy**, silently, because the spine told it the re-check was P1. (Note: in the union
model, *freeing* the old (D1, slot) is automatic once the row points to D2, so there is no orphan/double-free risk
— the only reassignment hole is the **missing new-slot re-check**, plus the self-row point below.) A related
latent edge: `check_and_occupy` must **exclude the appointment's own row**, or a same-slot reassignment/re-confirm
finds the appointment's own 대기/확정 row in the union and **rejects a legitimate no-op** — the spine never states
self-exclusion.

**Close it.** Resolve the contradiction: make FR-7 re-check **P0** in AD-4 (it's one `check_and_occupy` call), and
add to AD-4 that `check_and_occupy` takes an optional `exclude_appointment_id` (the row being updated) so
reassignment/confirm don't self-conflict.

---

## LOW

### L1 — UTC-floor vs session-tz grid CHECK vs naive/aware datetime input (AD-3, AD-9)

**Assessment.** AD-3 floors "UTC 기준"; the migration-3 CHECK uses `extract(minute/second from reserved_at)`, which
evaluates in the **session TimeZone**. For Korea (**UTC+9, a whole-hour offset**) the 30-minute grid boundaries and
minute/second extraction are **tz-invariant**, so UTC-floor and session-tz CHECK **coincide** — no divergence for
this deployment. Two residual, low-probability traps worth a one-liner in AD-3: (a) passing a **naive**
`datetime` (no tzinfo) vs a tz-aware one into `to_slot()` yields different floors — psycopg 3 returns tz-aware for
timestamptz, so pin "inputs to `to_slot()` are tz-aware UTC"; (b) the whole invariance breaks if a non-whole-hour
zone (e.g. UTC+5:30) is ever introduced or the DB session tz is left unpinned. Cheap to close, unlikely to bite in
3 days.

---

## Summary table

| # | Sev | AD(s) | Divergence in one line |
|---|-----|-------|------------------------|
| C1 | CRITICAL | AD-3, AD-4 | `to_slot()` is Python but the union check is SQL, and `visited_at` store-form is unpinned → walk-in stored raw doesn't match exact-equality check → walk-in fails to block reservation (double-occupy). |
| H1 | HIGH | AD-2, AD-4, AD-5 | "Same transaction" not threadable: self-contained `check_and_occupy` vs connection-passing → check and insert land in different txs → TOCTOU reopens in a single session. |
| H2 | HIGH | AD-10, AD-8 | Envelope pinned, entity schema not → patient screen returns flat FK ids, staff screen returns nested objects; single `lib/api.ts` can't type one `Appointment`. |
| H3 | HIGH | AD-9 | Live PKs are `GENERATED ALWAYS AS IDENTITY`; "bigint identity" doesn't say so → explicit-id P0 seed inserts error on deploy. |
| H4 | HIGH | AD-5 | Partial unique index = "≤1 record per appointment (any status)", not "non-cancelled"; no status-eligibility guard → record on a 취소 appt flips it to 완료. |
| M1 | MEDIUM | AD-6 | Appointment-path record dept source unpinned: booked `appointment.hospital_department_id` vs assigned `doctor.hospital_department_id` → inconsistent history. |
| M2 | MEDIUM | AD-8, AD-10 | `patient_id` transport unpinned: `?patient_id=` vs `/patients/{id}/…` both "compliant" → single client can't call one shape. |
| M3 | MEDIUM | AD-4 vs Deferred | AD-4 requires FR-7 re-check; Deferred defers it → plain-UPDATE reassignment double-occupies. Plus `check_and_occupy` self-row exclusion unstated. |
| L1 | LOW | AD-3, AD-9 | UTC-floor vs session-tz CHECK coincide for Korea (whole-hour offset); only naive-vs-aware datetime input and non-whole-hour zones are latent traps. |

**Bottom line for the 3-day build.** C1 and H1 both attack the same organ — the (doctor, slot) occupancy check —
and either one lets a walk-in and a reservation double-book the same doctor+slot, which is the app's core promise.
H3 will halt the P0 seed on day 1. H2 will surface the moment patient and staff screens are built in separate
sessions. Close C1, H1, H3, H4 before writing occupancy/seed code; M1–M3 before the second screen/service.
