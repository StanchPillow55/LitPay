# LitPay Success Metrics

**Version:** 1.0  
**Last Updated:** 2025-11-15

This document defines quantitative, verifiable success criteria for all deliverables. These metrics must be validated before marking any deliverable as complete.

---

## 1) Backend

### 1.1 Database Schema & Migrations

- ✅ **All tables present** (`sessions`, `policy_reservations`, `spend_ledger`, `artifacts`, `invoices`, `meter_events`, `webhook_events`): **7/7** created via migration
- ✅ Migration runtime (cold start → apply): **≤ 15 s** on dev DB
- ✅ Schema drift checks: **0** differences reported by migration tool on rerun
- [ ] Seed script: inserts **≥ 1** demo session and **≥ 5** demo papers in **≤ 5 s**

**Status:** 3/4 complete (missing seed script)

---

### 1.2 Local Policy Engine (with TTL reservations)

- ✅ `canSpend` correctness test suite: **100%** pass on **≥ 20** unit tests (limits, concurrency, expiry)
- ✅ Reservation TTL: auto-expiry at **15 ± 1 min**; **0** committed reservations past TTL
- ✅ Race-condition test (10 concurrent approvals at 500¢ with 1500¢ cap): committed spend **≤ 1500¢** (no overspend)
- ✅ Denial reasons coverage: **4/4** rules produce distinct reasons (daily, session, per-call, provider ceiling)

**Status:** 4/4 complete ✅

---

### 1.3 API Routes

- ✅ Endpoints implemented & typed: **4/6** (session create/get, artifacts, policy check)
- ✅ Contract conformance (schema validation): **100%** of implemented responses validated in tests
- [ ] p95 latency (dev, warm):
  - `/api/session/:id/search` **≤ 1200 ms** (not implemented)
  - `/api/session/:id/enrich` **≤ 800 ms** (not implemented)
  - `/api/session/:id/synthesize` **≤ 15 s** (not implemented)

**Status:** 4/6 endpoints complete

---

### 1.4 Stripe Webhook Handler

- ✅ Signature verification: **100%** of test events validated; **0** false accepts
- [ ] Idempotency: re-sending the same event **5x** results in **1** ledger write (not tested)
- ✅ Event coverage: handle **3/3** (`invoice.paid`, `charge.succeeded`, `payment_link.created`)
- [ ] p95 handler latency: **≤ 400 ms** (not measured)

**Status:** 2/4 complete (needs idempotency test and latency measurement)

---

### 1.5 x402 Buyer/CDP Module

- [✓] 402 → pay → 200 round-trip success rate: **100%** over **3** test cases (mock payment)
- [ ] On-chain confirmation wait (Base Sepolia): **not tested** (requires testnet ETH)
- [✓] Reservation commit on success: **100%**; reservation release on failure/timeouts: **100%**
- [✓] Envelope limits: reject if **price > 500¢** or **budget insufficient**: **validated**

**Status:** 3/4 complete (on-chain confirmation not tested - requires testnet funds)

---

## 2) Frontend (Next.js)

### 2.1 Pages & UX

- [ ] Pages implemented: **3/3** (`/`, `/session/:id`, report view)
- [ ] Upload acceptance: PDF/MD up to **20 MB**; client-side validation error rate **0%** on valid files
- [ ] Live progress (WS or SSE): updates **≥ 1 Hz** during search/enrich; connection drop rate **< 1%** over 10-min demo

**Status:** 0/3 complete (not started)

---

### 2.2 Usability Metrics

- [ ] Time to first results (upload → candidate list): **≤ 8 s** (OA-first, cache warm)
- [ ] "Why we paid" visibility: **100%** of paid items show **tx hash** and **cost**
- [ ] Export actions: HTML/MD/PDF available; each export **≤ 2 s** render time on dev

**Status:** 0/3 complete (not started)

---

## 3) Claude Integration (Synthesis)

- [ ] Output size: **≥ 1,200** tokens; **≤ 2,000** tokens per spec
- [ ] Structure compliance (Background, Methods, Findings, Gaps, Next Steps, References, Decision Log): **100%** of runs
- [ ] Citation validation: **≥ 90%** of DOIs resolve (HTTP 200) in check script
- [ ] Determinism guard: temperature **0.3**; variance in section headers across **3** runs **= 0**

**Status:** 0/4 complete (not implemented)

---

## 4) Object Storage (S3/MinIO)

- [ ] Buckets/paths: `/uploads/{sessionId}/…` & `/outputs/{sessionId}/…` created on first run
- [ ] Upload throughput: **≥ 15 MB/s** local; **≥ 3 MB/s** over network (dev)
- [ ] Retention job: marks content **≥ 90 days** old; dry-run shows **100%** correct targeting

**Status:** 0/3 complete (not implemented)

---

## 5) Testing

### 5.1 Unit Tests

- [ ] Coverage for policy engine + helpers: **≥ 85%** lines, **≥ 90%** branches
- ✅ TTL expiry test: **100%** pass; no zombie reservations remain after **16 min**

**Status:** 1/2 complete

---

### 5.2 Integration Tests

- [ ] x402 flow with sandbox seller: **≥ 10** successful transactions; **0** un-released reservations on error
- [ ] Stripe test webhooks: **≥ 10** events replayed with **0** duplicate ledger writes
- [ ] CDP signing: **100%** of payment payloads verified by facilitator

**Status:** 0/3 complete

---

### 5.3 E2E Tests

- [ ] Full session (upload → search → enrich ≥1 → synthesize → export) completes **≤ 2 min** wall-clock
- [ ] Budget exhaustion scenario: first **n** enrichments allowed, **n+1** denied with correct reason—verified in UI and API
- [ ] Payment failure handling: simulate **1** declined tx → reservation released within **≤ 5 s**

**Status:** 0/3 complete

---

### 5.4 Non-Functional Tests

- [ ] Load: **10 RPS** to `/enrich` for **60 s** with **≥ 95%** success; p95 app latency **≤ 900 ms** (excluding chain)
- [ ] Chaos: drop **10%** Stripe webhooks; **100%** reconciled via retry within **≤ 2 min**

**Status:** 0/2 complete

---

## 6) Artifacts to Deliver

- [ ] Running app: `npm start` brings up server; health checks return **200** ✅ (partial: backend only)
- [ ] `.env.example`: **100%** variables documented, **0** real secrets
- ✅ Migrations: `npm run migrate` completes with **0** errors
- [ ] Seed script: `npm run seed` creates **1** session + **5** papers + **1** artifact in **≤ 5 s**
- [ ] Architecture diagram: `litpay_system_design_nolocus.png` included and referenced in README ✅ (exists in specs/)
- [ ] Specs pack: `specs_nolocus_pack.zip` present; links in README
- [ ] Demo script (7 min): steps enumerated; dry-run matches within **± 30 s**

**Status:** 2/7 complete

---

## 7) Stripe Metering (MVP)

- [ ] Meter events emitted: **≥ 1** per session for tokens OR enrichCalls
- [ ] Webhook → `meter_events` upsert latency: **≤ 1 s** p95
- [ ] Monthly reconciliation dry-run: **ledger total – Stripe invoice total** **= $0.00 ± $0.01** (rounding)

**Status:** 0/3 complete

---

## 8) x402 Seller (Enricher)

- [✓] Endpoint: `GET /enrich/claims?doi=…` returns **402** then **200** with valid JSON schema
- [✓] Price controls: request denied if buyer offers less than price; **0** underpayments accepted
- [✓] Availability: uptime **100%** during test window (mock seller)

**Status:** 3/3 complete (mock implementation)

---

## 9) Security & Compliance (MVP scope)

- [ ] Secrets: **0** secrets committed; pre-commit hook blocks accidental commits
- ✅ Webhook security: **100%** events verified; failing signatures **blocked**
- [ ] PII: only user email (optional) and uploaded docs; delete flow removes **100%** of session artifacts in **≤ 30 s** (dev)

**Status:** 1/3 complete

---

## 10) Stretch (Beta/GA) Quantitative Targets

### Dashboards (Beta)
- [ ] Cost by session/provider charts render in **≤ 1 s** from cached materialized views
- [ ] Data freshness lag **≤ 60 s**

### Forecasting (Beta)
- [ ] MAPE (mean abs % error) of cost forecast for next 5 enrichments **≤ 20%**

### Performance SLOs (GA)
- [ ] p95 end-to-end ≤ **20 s**
- [ ] Webhook success **≥ 99.9%** within **2 min**
- [ ] Ledger drift **< $0.01/day** sustained over **7 days**

### Compliance (GA)
- [ ] Audit export produced in **≤ 60 s**, includes **100%** spend actions
- [ ] "Right to delete" end-to-end (trigger → confirmation) **≤ 24 h** (prod)

**Status:** 0/8 complete (stretch goals)

---

## Overall Progress Summary

### Backend Core Infrastructure
**Progress:** 19/26 metrics complete (73%)
- Database: 3/4 (✓)
- Policy Engine: 3/4 (✓)
- API Routes: 4/6 (67%)
- Webhooks: 2/4 (50%)
- x402 Buyer: 3/4 (✓)
- x402 Seller: 3/3 (✓)

### Frontend
**Progress:** 0/6 metrics complete (0%)

### Integration & Testing
**Progress:** 1/10 metrics complete (10%)

### Artifacts & Documentation
**Progress:** 2/7 metrics complete (29%)

---

## MVP Readiness Threshold

**Minimum to demo:** 40/56 metrics (71%)

**Current status:** 22/56 metrics (39%)

**Remaining:** 18 metrics to reach MVP threshold

---

## How to Operationalize These Numbers

1. Add test scripts that validate each metric automatically
2. Create GitHub Action that runs tests and fails if KPIs breach thresholds
3. Attach one-page scoreboard to demo (JSON or table) showing live pass/fail by metric
4. Update this document as metrics are validated
5. Tag commits with metric completion status

---

## Validation Commands

```bash
# Database schema validation
npm run migrate && npm run test:schema

# Policy engine tests
node test-policy.js

# API endpoint tests
./test-api.sh

# Webhook tests
stripe trigger charge.succeeded && check logs

# Full test suite (when implemented)
npm test
```
