# 🎯 Interview Prep - LitPay

**Last Updated:** 2026-02-10
**Documentation Pointers:** All claims link to internal docs in `docs/generated/`

---

## 60-90 Second STAR Pitch

### Situation
AI research assistants need to purchase paywalled academic content autonomously, but existing payment systems (Stripe) have minimum transaction amounts (~$0.50 practical minimum due to fixed fees) and no built-in budget controls.

### Task
Build a payment orchestration system that enables AI agents to make micropayments for research content while enforcing strict budget limits to prevent runaway spending.

### Action
- Designed a **dual-payment architecture**: x402/CDP micropayments for content purchases, Stripe for user billing
- Implemented a **local policy engine** with PostgreSQL row-level locking to prevent race conditions in concurrent budget checks
- Built **multi-source discovery** (Crossref, OpenAlex, Unpaywall) with utility scoring algorithm
- Created **Next.js 14 frontend** with live progress tracking and transaction receipts

### Result

| Metric | Status | Evidence | Details Pointer |
|--------|--------|----------|----------------|
| 9/9 policy tests | **Confirmed** | `test-policy.js:1-125` | → `TESTING.md` § Policy Engine Tests |
| 3/3 x402 tests | **Confirmed** | `test-x402.js:1-179` | → `TESTING.md` § x402 Payment Tests |
| Concurrency: 0 overspend | **Confirmed** | `test-concurrency.js:84-98` | → `TESTING.md` § Concurrency Tests |
| E2E workflow functional | **Confirmed** | `test-e2e.sh:1-100` | → `TESTING.md` § E2E Workflow Test |
| Production metrics | **Unknown** | Not deployed | Would need APM integration |

### What "9/9 Policy Tests" Validates

1. Session creation
2. Initial budget status retrieval (5000¢ daily, 1500¢ session, 3000¢ x402, 500¢ per-call)
3. Small spend approval (100¢) → returns `allow: true` + `reservationId`
4. Budget deduction after commit
5. Per-call maximum rejection (600¢ > 500¢ max)
6. Reservation release on payment failure
7. Session cap enforcement (1500¢ cumulative)
8. Final ledger accuracy
9. TTL cleanup of expired reservations

**Full details:** → `docs/generated/TESTING.md` § Policy Engine Tests

### What "3/3 x402 Tests" Validates

1. **Full payment cycle:** 402→policy check→mock payment→retry with receipt→ledger commit
2. **Budget denial:** 600¢ request correctly rejected
3. **Double-spend prevention:** Reused payment hash returns 409

**Full details:** → `docs/generated/TESTING.md` § x402 Payment Tests

### What "0 Overspend" Means

**Scenario:** 10 parallel requests × 500¢ each with 1500¢ session cap
**Expected:** 3 approvals (3 × 500¢ = 1500¢), 7 denials
**Assertion:** `session.total_cost_cents ≤ SESSION_CAP` — verified at `test-concurrency.js:84-98`
**Denied requests receive:** `{allow: false, reason: "Session cap of 1500¢ exceeded"}`

**Full details:** → `docs/generated/TESTING.md` § Concurrency Tests

---

## Technical Deep Dive

### Architecture

**Backend Modules:**
| Module | Entrypoint | Lines | Purpose |
|--------|-----------|-------|--------|
| API Server | `server.js` | ~630 | Express routes, webhooks |
| Policy Engine | `policy.js` | ~380 | Budget enforcement |
| Database Layer | `db.js` | ~325 | PostgreSQL abstraction |
| x402 Buyer | `x402-buyer.js` | ~310 | Payment flow handler |
| Discovery | `discovery.js` | ~290 | Multi-source search |

**Full details:** → `docs/generated/ARCHITECTURE.md` § Major Components

### CDP (Coinbase Developer Platform)

**Definition:** Coinbase's SDK for Web3 applications
**Role:** Wallet management + transaction signing for x402 payments
**Integration:** `@coinbase/coinbase-sdk` via `x402-buyer.js`
**Config:** `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_NETWORK` (default: base-sepolia)

**Full details:** → `docs/generated/PROTOCOL_X402.md` § CDP

### x402 Protocol Details

**Headers parsed from 402 response:**
- `price` (token amount), `priceCents`, `payTo` (recipient address), `assetId`, `network`

**Receipt format:** Transaction hash (`0x` + 64 hex chars)

**Retry:** Same URL, same params, add `X-PAYMENT: <txHash>` and `X-PAYMENT-NETWORK: base-sepolia`

**Full details:** → `docs/generated/PROTOCOL_X402.md` § Protocol Flow

### Stripe Events Supported

| Event | Handler |
|-------|--------|
| `invoice.paid` | Upsert invoice record |
| `charge.succeeded` | Create ledger entry if `metadata.sessionId` present |
| `payment_link.created` | Log only |

**Evidence:** `server.js:68-114`
**Full details:** → `docs/generated/RUNBOOK.md` § Stripe Event Types

---

## Key Tradeoffs (Resolved)

### Local Policy Engine vs External Authorization

**Why local:**
- Latency: Budget checks on critical path (~50ms avg); external adds network RTT
- Availability: External failure blocks all payments
- Consistency: Reservation must be in same DB transaction
- Auditability: Ledger already in PostgreSQL

**Tradeoff:** Cannot reuse without extracting to shared library; horizontal scaling needs distributed lock

**How to externalize:** Extract rules to JSON, create gRPC service, implement Redis distributed lock

**Full details:** → `docs/generated/DECISIONS.md` § ADR-1

### Row-Level Locking vs Optimistic Concurrency

**Why pessimistic:**
- Requirement: Must guarantee no overspend under any load
- Problem with optimistic: Retry loops have non-zero failure rate
- Financial risk: Even one overspend is compliance failure

**Lock granularity:** Global (single row `policy_lock.id = 1`) — all checks serialize

**Full details:** → `docs/generated/DECISIONS.md` § ADR-2

### Reservation Lifecycle

**States:** `canSpend` → INSERT (uncommitted) → APPROVE/REJECT → `commit`/`release`

**On payment failure:** `releaseReservation()` DELETEs reservation, creates `failed` ledger entry

**Atomic commit:** Inside `db.transaction()`: mark committed=true, INSERT ledger, UPDATE session cost

**TTL cleanup:** Background job every 5 min; SQL: `DELETE WHERE expires_at < now() AND NOT committed`

**Full details:** → `docs/generated/DECISIONS.md` § ADR-3

---

## Database Schema (Confirmed)

**8 tables** (not 7):

| Table | Purpose | Key Columns | JSONB Usage |
|-------|---------|-------------|-------------|
| `sessions` | Research sessions | id, user_id, status, total_cost_cents | — |
| `policy_reservations` | TTL budget holds | amount_cents, provider, expires_at, committed | — |
| `spend_ledger` | Transaction log | amount_cents, status, metadata | `metadata`: txHash, doi, error |
| `artifacts` | Files/reports | type, s3_key, metadata | `metadata`: query, report content |
| `invoices` | Stripe billing | stripe_invoice_id, amount_cents, metadata | `metadata`: stripeData |
| `meter_events` | Usage tracking | event_name, value, metadata | `metadata`: custom data |
| `webhook_events` | Idempotency | stripe_event_id, event_type, metadata | `metadata`: processedAt |
| `policy_lock` | Concurrency mutex | id (always 1) | — |

**Evidence:** `schema.sql:1-145`, `migrations/003_policy_lock.sql`

### 7-Year Retention Clarification

**Status:** Design target, not implemented mechanism
- ⚠️ No automatic archival
- ⚠️ No partitioning
- ⚠️ No WORM behavior at DB level

**"Immutable" means:** No DELETE method in code; status changes via UPDATE only

**Full details:** → `docs/generated/DECISIONS.md` § ADR-6

---

## Drill-Down Q&A (Resolved)

### Q1: "What if 100 concurrent requests hit the policy engine?"

**Answer (Confirmed):** Lock serializes all checks. Lock wait logged at >100ms.

**Measured times:** Test shows 10 concurrent complete in ~100-300ms total (~10-30ms avg per request including lock wait). No p95 metrics available without APM.

**Mitigation:** Keep tx <50ms. Production: shard locks per user/session.

**Evidence:** `policy.js:58-61`, `test-concurrency.js:127-130`

### Q2: "Why not use Stripe for all payments?"

**Answer (Confirmed):** Stripe's fixed fees make sub-$0.50 transactions uneconomical. LitPay content costs 1-5¢ per article.

**Implementation constraint:** `x402-seller-mock.js:40` sets `PRICE_CENTS = 1` demonstrating micropayment use case.

### Q3: "How do you prevent double-booking budget?"

**Answer (Confirmed):** Reservation-before-check pattern. INSERT happens before querying totals.

**Evidence:** `policy.js:75-81`

### Q4: "What happens if server crashes mid-transaction?"

**Answer (Confirmed):** PostgreSQL rollback handles uncommitted changes. Committed reservations expire via 15-min TTL.

**Evidence:** `policy.js:77`

### Q5: "How do you ensure webhook idempotency?"

**Answer (Confirmed):** Store event IDs in `webhook_events`. Check before processing; skip duplicates.

**Evidence:** `server.js:58-62`

### Q6: "Why three discovery sources?"

**Answer (Confirmed):** Crossref (bibliographic), OpenAlex (citations), Unpaywall (OA status). Combined scoring optimizes for high-value accessible content.

**Evidence:** `README.md:25-26`, `discovery.js:14-50`

### Q7: "What's your biggest performance bottleneck?"

**Answer (Confirmed):** Policy lock contention. Single row serializes all checks.

**Evidence:** `policy.js:53-61`

### Q8: "How debug failed payment / base-sepolia?"

**Chain:** Base Sepolia (Ethereum L2 testnet)
**Explorer:** `https://sepolia.basescan.org/tx/<txHash>`
**Storage:** `spend_ledger.metadata->>'txHash'`

**Evidence:** `x402-seller-mock.js:72`, `policy.js:173-180`

### Q9: "Why not Redis for caching?"

**Answer (Inferred):** MVP prioritized correctness over performance.

**What would be cached:** Discovery results (article metadata), DOI→OA status mapping, budget summaries

**Why not:** Redis doesn't solve concurrency (still need DB for source of truth); adds operational complexity for uncertain benefit at MVP scale

### Q10: "How handle partial discovery failures?"

**Answer (Confirmed):** Graceful degradation.

**Evidence:** `discovery.js:177-180` — `Promise.all([searchCrossref, searchOpenAlex])` runs both in parallel. Each source has try/catch returning `[]` on error (`discovery.js:84-87`, `discovery.js:123-125`). Results merged from available sources.

**Behavior:** If one source fails, results from other sources still returned. No request-level failure for partial API errors.

---

## Reflection

### Technical Debt (Confirmed)

| Item | Location | Issue |
|------|----------|-------|
| Single policy lock | `policy.js:57` | Global lock doesn't scale horizontally |
| Frontend polling | `FRONTEND_ARCHITECTURE.md:157` | 0.5 Hz polling; WebSocket would reduce load |
| No connection pooling for discovery | `discovery.js` | Fresh axios calls; HTTP keep-alive may be automatic (Node default) but not explicit |

**Note on connection pooling:** Node.js HTTP agent defaults to `keepAlive: false` pre-v19, but axios may use persistent connections. Not explicitly configured.

### Roadmap (Inferred)

| Improvement | Effort | Expected Payoff |
|-------------|--------|----------------|
| Sharded policy locks | Medium | 10x+ concurrent users |
| WebSocket live updates | Low | 50% reduction in polling requests |
| Discovery result caching | Low | Faster repeat searches, reduced API calls |

---

## Quick Reference Pointers

| Topic | Document |
|-------|----------|
| Test details (all 9+3+1) | `docs/generated/TESTING.md` |
| x402/CDP protocol | `docs/generated/PROTOCOL_X402.md` |
| Architecture | `docs/generated/ARCHITECTURE.md` |
| ADRs + tradeoffs | `docs/generated/DECISIONS.md` |
| Operational runbook | `docs/generated/RUNBOOK.md` |
| Database schema | `schema.sql`, `migrations/003_policy_lock.sql` |
