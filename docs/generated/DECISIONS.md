# 📋 Architectural Decisions - LitPay

---

## ADR-1: Local Policy Engine (Not External Authorization Service)

**Decision:** Budget enforcement runs as local module, not external service (e.g., OPA, AWS permissions boundary)

**Evidence:** `policy.js` is a 297-line module loaded directly by `server.js:10`

**Constraints that forced "local":**
- **Latency:** Budget checks on critical path for every payment. External service adds network RTT.
- **Availability coupling:** External auth service failure would block all payments.
- **Consistency:** Need transactional budget reservation with database; external service can't participate in same transaction.
- **Auditability:** Ledger and reservations already in PostgreSQL; keeping policy local simplifies audit trail.

**Tradeoffs:**
- ✅ Zero network latency for budget checks (~50ms avg observed in tests)
- ✅ No external dependency for critical path
- ✅ Simpler deployment (single process)
- ✅ Atomic reservation + budget check in single transaction
- ⚠️ Cannot reuse policy logic without extracting to shared library
- ⚠️ Horizontal scaling requires sticky sessions or distributed lock

**How to externalize later:**
1. Extract policy rules to declarative format (JSON/YAML)
2. Create policy service with gRPC API
3. Implement distributed locking (Redis) for concurrency
4. Cache budget summaries in Redis with short TTL
5. Fallback to local engine if external unavailable

**Evidence:** `policy.js:1-225`, `test-concurrency.js` shows ~50-100ms per check

---

## ADR-2: Row-Level Locking for Concurrency Safety

**Decision:** Use PostgreSQL `SELECT ... FOR UPDATE` on a sentinel row to serialize budget checks

**Evidence:** `policy.js:57` — `SELECT 1 FROM policy_lock WHERE id = 1 FOR UPDATE`

**Why not optimistic concurrency (retry loop)?**
- **Requirement:** Must guarantee no overspend under any concurrent load
- **Problem with optimistic:** Conflict detection after-the-fact requires retry, which can fail repeatedly under load
- **Financial risk:** Even one overspend is a compliance failure; retry loops have non-zero failure rate
- **Complexity:** Retry logic + exponential backoff + jitter adds code complexity for uncertain benefit

**Pessimistic locking guarantees:**
- Exactly 3 approvals in 10-concurrent-request test (zero variance observed)
- No overspend possible (sum of approved ≤ budget by construction)
- Simple failure mode: timeout or error, no silent corruption

**Lock granularity:**
- **Current:** Global lock (single row `policy_lock.id = 1`)
- **Evidence:** `migrations/003_policy_lock.sql:3-4` — `CHECK (id = 1)` enforces single row
- **Keying:** Not per-session or per-user; all budget checks serialize globally

**Tradeoffs:**
- ✅ Prevents race conditions (tested: 10 concurrent, 3 approved, 0 overspend)
- ✅ Transactional — failed checks auto-rollback
- ⚠️ Single-threaded bottleneck for all budget operations
- ⚠️ Lock wait time logged at >100ms (`policy.js:59-61`)

**Implications:**
- High-traffic scenarios will see lock contention
- Must keep budget check transactions short (<50ms target)
- For multi-tenant scaling: shard lock table by user_id or session_id

---

## ADR-3: Reservation-Before-Check Pattern

**Decision:** Create budget reservation before checking limits, not after

**Evidence:** `policy.js:75-81` — Reservation INSERT happens before daily/session total queries

### Reservation Lifecycle (State Machine)

```
┌─────────────┐
│   canSpend  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ INSERT reservation │ ◄── expires_at = now() + 15 min
│ committed = false   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
[APPROVE]  [REJECT]
    │         │
    ▼         ▼
┌──────────┐  ┌──────────┐
│ Payment  │  │ DELETE   │
│ attempt  │  │ reservation │
└────┬─────┘  └──────────┘
     │
 ┌───┴───┐
 │       │
 ▼       ▼
[OK]   [FAIL]
 │       │
 ▼       ▼
┌────────────┐  ┌────────────┐
│ commitRes  │  │ releaseRes │
│ committed=T│  │ DELETE +   │
│ + ledger   │  │ failed log │
└────────────┘  └────────────┘
```

### What happens if payment fails after reservation?

1. `releaseReservation()` is called
2. Reservation is DELETEd from `policy_reservations`
3. `failed` entry created in `spend_ledger` with error metadata
4. Budget is immediately freed for other requests

**Evidence:** `policy.js:272-294`

### Is reservation converted to ledger atomically?

**Yes.** `commitReservation()` runs inside `db.transaction()`:
1. Mark reservation `committed = true`
2. INSERT `committed` ledger entry
3. UPDATE session `total_cost_cents`

**Evidence:** `policy.js:234-261`

### TTL Cleanup

**Location:** Background job in `server.js:616-622`
**Frequency:** Every 5 minutes
**Behavior:** Calls PostgreSQL function `cleanup_expired_reservations()`
**SQL:** `DELETE FROM policy_reservations WHERE expires_at < now() AND NOT committed`

**Evidence:** `schema.sql:124-136`, `server.js:616-622`

**Tradeoffs:**
- ✅ Concurrent checks see each other's reservations immediately
- ✅ Prevents double-booking of budget
- ⚠️ Must cleanup reservation on rejection (`policy.js:106`)
- ⚠️ Orphaned entries possible on crash (cleaned by TTL)

---

## ADR-4: x402/CDP for Micropayments (Not Stripe Only)

**Decision:** Use HTTP 402 protocol with Coinbase Developer Platform for content purchases, Stripe for user billing

**Evidence:**
- `x402-buyer.js` — Handles 402 responses
- `README.md:12` — "x402/CDP micropayments for enriched research data"

**Tradeoffs:**
- ✅ Sub-dollar transactions feasible (Stripe minimum is $0.50)
- ✅ Blockchain receipt provides immutable audit trail
- ✅ Content sellers can use standard HTTP protocol
- ⚠️ Requires CDP account and wallet management
- ⚠️ Settlement on base-sepolia (testnet) — prod would need mainnet

**Alternatives Considered:** Unknown

---

## ADR-5: Multi-Source Discovery with Utility Scoring

**Decision:** Query three APIs (Crossref, OpenAlex, Unpaywall) and score results with weighted algorithm

**Evidence:**
- `discovery.js` — Multi-source queries
- `README.md:25-26` — "Multi-source discovery: Crossref + OpenAlex + Unpaywall"
- Scoring weights: relevance 40%, citations 25%, OA 15%, recency 20%

**Tradeoffs:**
- ✅ Comprehensive coverage (bibliographic + impact + access)
- ✅ Prioritizes high-value open access content
- ⚠️ 3x API calls per search query
- ⚠️ Latency depends on slowest source

**Implications:**
- Must handle partial failures (one source down)
- Rate limits differ per source

---

## ADR-6: Immutable Spend Ledger with 7-Year Retention

**Decision:** All financial transactions recorded in append-only `spend_ledger` with no DELETE operations

**Evidence:**
- `db.js:128-186` — Ledger module (no delete method)
- `README.md:193` — "Complete spend ledger (7-year retention)"
- `schema.sql:37` — Comment: "7 year retention for compliance"

### Compliance Clarification

**Status:** Design target, not implemented retention mechanism

**Why 7 years?** Common financial record retention period (US IRS: 7 years for most business records, SOX: 7 years for audit workpapers). However:

- ⚠️ **No automatic archival implemented** — table grows indefinitely
- ⚠️ **No partitioning** — single table, no date-based sharding
- ⚠️ **No WORM behavior** — soft-delete not prevented at DB level

**What "immutable" means in practice:**
- No `DELETE` method in `db.ledger` module
- No application code path to delete entries
- Status changes via `UPDATE` only (pending → committed/failed)

**To implement true retention:**
1. Add table partitioning by `created_at` (PARTITION BY RANGE)
2. Add archival job to move old partitions to cold storage
3. Add check constraint preventing UPDATE/DELETE on old rows

**Tradeoffs:**
- ✅ Full audit trail for compliance investigations
- ✅ Supports chargeback investigations
- ⚠️ Table will grow indefinitely (est. ~1KB per entry)
- ⚠️ Archival not implemented
- ⚠️ Long-term query performance unknown

---

## ADR-7: Stripe Webhook Idempotency via Event ID

**Decision:** Track processed webhook event IDs in `webhook_events` table

**Evidence:** `server.js:58-62` — Checks `db.webhookEvents.isProcessed(event.id)` before handling

**Tradeoffs:**
- ✅ Safe against duplicate deliveries (Stripe retry behavior)
- ✅ No duplicate ledger entries
- ⚠️ Extra DB query per webhook

**Implications:**
- `webhook_events` table grows with each event
- Can prune old events after retention period

---

## ADR-8: Next.js 14 App Router for Frontend

**Decision:** Use Next.js 14 with App Router (not Pages Router)

**Evidence:** `FRONTEND_ARCHITECTURE.md:3` — "Framework: Next.js 14+ (App Router)"

**Tradeoffs:**
- ✅ Server Components for performance
- ✅ Streaming SSR capabilities
- ✅ Modern file-based routing
- ⚠️ Newer API, less community examples than Pages Router

**Implications:**
- Must use `'use client'` directive for interactive components
- API routes in `/app/api/` directory
