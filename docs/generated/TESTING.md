# 🧪 Testing Documentation - LitPay

**Test Type:** Integration tests (database-backed, no mocking of core components)
**Evidence:** Tests use real PostgreSQL via `db.js`, run against live database schema

---

## Policy Engine Tests (`test-policy.js`)

**File:** `test-policy.js` (125 lines)
**Command:** `npm run test:policy`
**Type:** Sequential integration tests

### Test Cases (9 total)

| # | Test Name | Policy Validated | Invariant Asserted |
|---|-----------|------------------|-------------------|
| 1 | Create test session | Session creation | `db.sessions.create()` returns valid UUID |
| 2 | Check initial budget status | Budget retrieval | `getBudgetStatus()` returns all limits (daily: 5000¢, session: 1500¢, x402: 3000¢, per-call: 500¢) |
| 3 | Small spend within limits | Per-call + session + daily limits | 100¢ spend returns `allow: true` with `reservationId` |
| 4 | Check budget after spend | Budget deduction | `session.spent` increases by committed amount |
| 5 | Per-call maximum exceeded | Per-call limit (500¢) | 600¢ request returns `allow: false`, reason contains "Per-call maximum" |
| 6 | Reservation with release | Reservation lifecycle | `releaseReservation()` removes pending reservation, creates `failed` ledger entry |
| 7 | Session cap enforcement | Session limit (1500¢) | Multiple 300¢ spends blocked when cumulative exceeds 1500¢ |
| 8 | Final budget status | Ledger accuracy | `finalStatus.session.spent` matches sum of committed ledger entries |
| 9 | Cleanup expired reservations | TTL enforcement | `cleanupExpiredReservations()` removes expired rows from `policy_reservations` |

**Key Constants:**
- `POLICY_DAILY_BUDGET_CENTS`: 5000 (=$50)
- `POLICY_SESSION_CAP_CENTS`: 1500 (=$15)
- `POLICY_PER_CALL_MAX_CENTS`: 500 (=$5)
- `POLICY_PROVIDER_X402_DAILY_CEILING_CENTS`: 3000 (=$30)
- `RESERVATION_TTL_MINUTES`: 15

**Evidence:** `test-policy.js:1-125`, `policy.js:5-11`

---

## x402 Payment Tests (`test-x402.js`)

**File:** `test-x402.js` (179 lines)
**Command:** `npm run test:x402`
**Prerequisite:** Mock seller must be running (`node x402-seller-mock.js` on port 3001)
**Type:** Integration tests with mock seller

### Test Cases (3 total)

| # | Test Name | Behavior Validated | Invariant Asserted |
|---|-----------|-------------------|-------------------|
| 1 | x402 Payment Flow | Full 402→pay→retry cycle | (a) Unauthenticated request returns HTTP 402 with `{price, priceCents, payTo, assetId, network}`. (b) Policy check returns `allow: true`. (c) Payment header accepted → HTTP 200 with enriched data. (d) Ledger entry created with `status: committed` and `metadata.txHash`. |
| 2 | Budget Denial | Per-call limit enforcement | 600¢ request (> 500¢ max) returns `allow: false` |
| 3 | Double-Spend Prevention | Payment uniqueness | Reusing same `X-PAYMENT` header returns HTTP 409 with `error: "Payment already processed"` |

**x402 Protocol Fields Tested:**
- **Request headers:** `x-client-id`, `X-PAYMENT`, `X-PAYMENT-NETWORK`
- **402 Response body:** `{error, price, priceCents, payTo, assetId, network, message}`
- **Receipt format:** Transaction hash (hex string, 0x-prefixed)

**Evidence:** `test-x402.js:1-179`, `x402-seller-mock.js:45-126`

---

## Concurrency Tests (`test-concurrency.js`)

**File:** `test-concurrency.js` (150 lines)
**Command:** `npm run test:concurrency`
**Type:** Parallel stress test

### Scenario Parameters

| Parameter | Value | Derivation |
|-----------|-------|------------|
| `NUM_REQUESTS` | 10 | Fixed test constant |
| `AMOUNT_PER_REQUEST` | 500¢ | Equal to `POLICY_PER_CALL_MAX_CENTS` |
| `SESSION_CAP` | 1500¢ | From `policy.LIMITS.SESSION_CAP` |
| `EXPECTED_SUCCESS` | 3 | `floor(1500 / 500) = 3` |
| `EXPECTED_DENIAL` | 7 | `10 - 3 = 7` |

### Acceptance Criteria

| Assertion | Condition | Evidence |
|-----------|-----------|----------|
| **No overspend** | `session.total_cost_cents <= SESSION_CAP` | `test-concurrency.js:84-98` |
| **Correct approval count** | `approved.length == 3` (±0 tolerance at perfect timing) | `test-concurrency.js:101-108` |
| **All denials have reasons** | Every rejected result has non-empty `reason` field | `test-concurrency.js:111-116` |

### Denial Behavior

Rejected requests receive:
```json
{
  "allow": false,
  "remainingBudgetCents": 0,
  "reason": "Session cap of 1500¢ exceeded. Spent: 1500¢"
}
```

**Evidence:** `test-concurrency.js:119-124`

---

## E2E Workflow Test (`test-e2e.sh`)

**File:** `test-e2e.sh` (100 lines)
**Command:** `npm run test:e2e` or `./test-e2e.sh`
**Prerequisite:** Backend running on port 3000, ANTHROPIC_API_KEY set
**Type:** Bash script exercising full research workflow

### Workflow Steps

| Step | Endpoint | Input | Success Criteria |
|------|----------|-------|-----------------|
| 1. Create session | `POST /api/session` | `{userId: "e2e-test-user"}` | Returns `sessionId` (UUID) |
| 2. Discovery | `POST /api/session/:id/search` | `{query: "machine learning transformers", maxResults: 10, minScore: 0.5}` | Returns `articles[]` with `score >= 0.5` |
| 3. Enrichment | `POST /api/session/:id/enrich` | `{dois: ["10.1234/test", "10.5678/demo"]}` | `successCount >= 1`, each success has `txHash` |
| 4. Session check | `GET /api/session/:id` | — | `total_cost_cents` matches `successCount * 1` |
| 5. Synthesize | `POST /api/session/:id/synthesize` | Enriched data from step 3 | Returns `{markdown, metadata}` |
| 6. Artifacts | `GET /api/session/:id/artifacts` | — | Contains upload + report artifacts |

### What "Synthesize" Means

**Definition:** Synthesize calls Claude API (claude-3-haiku-20240307) to generate a structured markdown research report.

**Inputs:**
- Research query (from discovery step)
- Enriched papers metadata (DOI, cost, txHash)
- Budget information (session cap, total spent)

**Output:**
```json
{
  "id": "report-<sessionId>",
  "sessionId": "<uuid>",
  "markdown": "## Background\n...",
  "query": "machine learning transformers",
  "generatedAt": "2025-11-15T...",
  "metadata": {
    "totalCost": 2,
    "articlesProcessed": 2,
    "model": "claude-3-haiku-20240307",
    "tokensUsed": 1234
  }
}
```

**Evidence:** `server.js:506-613`, `test-e2e.sh:67-79`

---

## Test Output Locations

| Test | Output Location | Format |
|------|----------------|--------|
| Policy tests | stdout | Console log with emoji indicators |
| x402 tests | stdout | Console log with step numbers |
| Concurrency | stdout | Metrics summary table |
| E2E | stdout | JSON excerpts via `jq` |

**CI Integration:** Not configured. Tests run locally via npm scripts.

---

## Verification Checklist

```bash
# Before running tests, ensure:
1. PostgreSQL running with POSTGRES_URL configured
2. Schema migrated: npm run migrate
3. For x402 tests: node x402-seller-mock.js (separate terminal)
4. For E2E tests: npm start (separate terminal) + ANTHROPIC_API_KEY set

# Run tests:
npm run test:policy      # Policy engine (9 tests)
npm run test:x402        # x402 flow (3 tests)  
npm run test:concurrency # Race condition (1 scenario)
npm run test:e2e         # Full workflow (6 steps)
```
