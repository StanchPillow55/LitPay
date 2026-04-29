# 📖 Runbook - LitPay

---

## Running in Production-Like Mode

### Prerequisites
```bash
# Required services
- PostgreSQL 14+ (with POSTGRES_URL)
- Stripe account (with webhook secret)
- CDP account (for real x402 payments)
- Anthropic API key (for synthesis)

# Required environment variables
POSTGRES_URL=postgresql://user:pass@localhost:5432/litpay
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_NETWORK=base-mainnet  # For production
ANTHROPIC_API_KEY=sk-ant-...
```

### Start Commands
```bash
# Terminal 1: Backend
npm start  # Port 3000

# Terminal 2: Frontend
cd frontend && npm start  # Port 3001

# Terminal 3: Stripe webhooks (dev/staging)
stripe listen --forward-to localhost:3000/webhooks/stripe
```

**Evidence:** `QUICKSTART.md:76-93`, `server.js:624-631`

---

## Health Checks

### Backend Health
```bash
# Simple health check
curl http://localhost:3000/
# Returns: {"status":"ok","service":"LitPay","version":"1.0.0"}

# Comprehensive health check (includes DB)
curl http://localhost:3000/health
# Returns: {"status":"healthy","timestamp":"...","database":"connected","version":"1.0.0","environment":"production"}
```

**Evidence:** `server.js:132-156`

### x402 Seller Health (if using mock)
```bash
curl http://localhost:3001/health
# Returns: {"status":"ok","service":"x402-seller-mock","price":"1¢","availableDOIs":[...]}
```

**Evidence:** `x402-seller-mock.js:128-136`

---

## Monitoring & Log Locations

### Console Logging

LitPay uses emoji-prefixed console logging:

| Prefix | Meaning | Example |
|--------|---------|---------|
| ✅ | Success | `✅ Session created: uuid` |
| ❌ | Error | `❌ Policy check error: message` |
| ⚠️ | Warning | `⚠️ Lock contention: 150ms wait` |
| ℹ️ | Info | `ℹ️ Event already processed, skipping` |
| 💳 | Payment | `💳 Received 402 Payment Required` |
| 🧹 | Cleanup | `🧹 Cleaned up 5 expired reservations` |

**Evidence:** `server.js:53-66`, `policy.js:60-61`

### Lock Contention Monitoring

Lock wait times are logged when > 100ms:

```
⚠️  Lock contention: 150ms wait for policy check
```

**What to monitor:**
- Frequency of contention logs
- Lock wait time trends
- Correlation with request volume

**Evidence:** `policy.js:58-61`

### Slow Query Logging

Queries taking > 1000ms are logged:

```
⚠️  Slow query (1234ms): SELECT COALESCE(SUM(amount_...
```

**Evidence:** `db.js:22-24`

---

## Common Failure Modes

### 1. Database Connection Failure

**Symptoms:**
- Health endpoint returns `{"status":"unhealthy","error":"..."}`
- API requests return 500 errors

**Mitigation:**
```bash
# Check PostgreSQL is running
psql $POSTGRES_URL -c "SELECT 1"

# Check connection pool status
# (no built-in endpoint, check logs for "Unexpected database error")
```

**Evidence:** `db.js:12-14`, `server.js:139-155`

### 2. Stripe Webhook Signature Failure

**Symptoms:**
- Webhook returns HTTP 400
- Log: `⚠️ Webhook signature verification failed`

**Mitigation:**
```bash
# Verify webhook secret is correct
stripe listen --print-secret

# Update .env with correct secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Evidence:** `server.js:43-55`

### 3. Budget Policy Rejection

**Symptoms:**
- Enrichment requests return `{"success":false,"error":"Budget check failed: ..."}`

**Common reasons:**
- Daily budget exceeded (5000¢)
- Session cap exceeded (1500¢)
- Per-call maximum exceeded (500¢)
- x402 daily ceiling exceeded (3000¢)

**Mitigation:**
```bash
# Check budget status
curl -X POST http://localhost:3000/api/policy/can-spend \
  -H "Content-Type: application/json" \
  -d '{"amountCents":1,"sessionId":"<uuid>","provider":"x402"}'
```

**Evidence:** `policy.js:63-173`

### 4. Reservation Leak (Orphaned Reservations)

**Symptoms:**
- Budget appears lower than ledger total
- `policy_reservations` table has old uncommitted entries

**Mitigation:**
- Automatic: Background job runs every 5 minutes (`server.js:616-622`)
- Manual: `SELECT cleanup_expired_reservations();` in PostgreSQL

**Evidence:** `server.js:616-622`, `schema.sql:124-136`

### 5. CDP Wallet Issues

**Symptoms:**
- x402 payments fail with "Failed to initialize CDP"
- Insufficient balance errors

**Mitigation:**
```bash
# Check wallet info
node -e "require('./x402-buyer').getWalletInfo().then(console.log)"

# Fund wallet on testnet
# Visit: https://www.coinbase.com/faucets/base-sepolia-faucet
```

**Evidence:** `x402-buyer.js:292-304`

---

## Background Jobs

### Reservation Cleanup

**Frequency:** Every 5 minutes
**Location:** `server.js:616-622`
**Action:** Deletes uncommitted reservations where `expires_at < now()`

```javascript
setInterval(async () => {
  await policy.cleanupExpiredReservations();
}, 5 * 60 * 1000);
```

**TTL:** 15 minutes (configurable via `RESERVATION_TTL_MINUTES`)

---

## Database Operations

### Reset Database (Development Only)
```bash
# Drop and recreate all tables
node reset-db.js  # If script exists

# Or manually:
psql $POSTGRES_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run migrate
```

### Check Table Sizes
```sql
SELECT 
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### Audit Ledger Query
```sql
-- Recent transactions
SELECT 
  created_at, provider, amount_cents, status, 
  metadata->>'txHash' as tx_hash,
  metadata->>'doi' as doi
FROM spend_ledger 
WHERE session_id = '<uuid>'
ORDER BY created_at DESC;
```

---

## Scaling Considerations

### Current Limits

| Resource | Limit | Evidence |
|----------|-------|----------|
| DB connections | 20 | `db.js:8` |
| Policy lock | Global (1 row) | `migrations/003_policy_lock.sql:3-4` |
| Reservation TTL | 15 min | `policy.js:10` |
| Cleanup interval | 5 min | `server.js:622` |

### Bottlenecks

1. **Policy lock contention** — All budget checks serialize through single row
2. **External API rate limits** — Crossref, OpenAlex, Unpaywall have daily quotas
3. **CDP transaction speed** — Blockchain confirmation adds latency

---

## Stripe Event Types Supported

| Event | Handler Action | Evidence |
|-------|---------------|----------|
| `invoice.paid` | Upsert invoice record | `server.js:69-81` |
| `charge.succeeded` | Create ledger entry if `metadata.sessionId` present | `server.js:83-102` |
| `payment_link.created` | Log only | `server.js:104-109` |

**Other events:** Logged but not processed (`ℹ️ Unhandled event type`)

**Evidence:** `server.js:68-114`
