# LitPay Implementation Plan (MVP)

**Version:** 1.0  
**Date:** 2025-11-15  
**Scope:** Weeks 1-2 MVP

---

## 🎯 System Overview

LitPay is an AI research assistant that enables autonomous agents to purchase gated academic content through:
- **x402/CDP micropayments** for enriched research data
- **Stripe** for user billing and metering
- **Local Policy Engine** for budget enforcement
- **Claude/Anthropic** for synthesis

---

## 📋 MVP Implementation

### Phase 1: Core Infrastructure

#### 1. Database Schema (Postgres)

```sql
-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  status TEXT CHECK (status IN ('active','completed','failed')) DEFAULT 'active',
  total_cost_cents INT DEFAULT 0
);

-- Policy reservations (15min TTL)
CREATE TABLE policy_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  provider TEXT CHECK (provider IN ('x402','stripe')) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  committed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_reservations_expires ON policy_reservations(expires_at) WHERE NOT committed;
CREATE INDEX idx_reservations_session ON policy_reservations(session_id);

-- Spend ledger (7 year retention for compliance)
CREATE TABLE spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT CHECK (provider IN ('x402','stripe')) NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT CHECK (status IN ('pending','committed','failed')) DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_ledger_session ON spend_ledger(session_id);
CREATE INDEX idx_ledger_provider_date ON spend_ledger(provider, created_at);
CREATE INDEX idx_ledger_created ON spend_ledger(created_at);

-- Artifacts (uploads, reports, receipts)
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('upload','report','receipt')) NOT NULL,
  s3_key TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_artifacts_session ON artifacts(session_id);

-- Stripe invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_stripe_id ON invoices(stripe_invoice_id);

-- Stripe meter events
CREATE TABLE meter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_meter_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  value INT NOT NULL,
  session_id UUID REFERENCES sessions(id),
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT now()
);
CREATE INDEX idx_meter_session ON meter_events(session_id);
CREATE INDEX idx_meter_timestamp ON meter_events(timestamp);
```

#### 2. Local Policy Engine

**Contract:**
```typescript
canSpend(amountCents: number, context: {
  sessionId: string;
  provider: 'x402' | 'stripe';
  tag?: string;
}) => Promise<{
  allow: boolean;
  remainingBudgetCents: number;
  reason?: string;
}>
```

**Rules:**
- Daily budget: 5000¢ ($50.00)
- Per-session cap: 1500¢ ($15.00)
- Per-call max: 500¢ ($5.00)
- x402 daily ceiling: 3000¢ ($30.00)

**Logic:**
1. Query `spend_ledger` for:
   - Daily total across all providers
   - Session total
   - x402 daily total (if provider='x402')
2. Check against all limits
3. If any limit exceeded → deny with specific reason
4. If allowed:
   - Insert reservation into `policy_reservations` with `expires_at = now() + 15 min`
   - Return approval with remaining budget
5. Background job expires uncommitted reservations

**Concurrency Safety:**
- Use database transactions
- Pre-reservations prevent race conditions
- 15min TTL prevents stuck reservations

#### 3. Stripe Webhooks

**Endpoint:** `POST /webhooks/stripe`

**Events:**
- `invoice.paid`
- `charge.succeeded`
- `meter_event.created`

**Security:**
- Verify `Stripe-Signature` header
- Reject timestamp skew > 5 minutes
- Use `STRIPE_WEBHOOK_SECRET` from env

**Idempotency:**
- Use Stripe `event.id` as idempotency key
- Check if event already processed before upserting

**Actions:**
```javascript
invoice.paid:
  - Upsert to invoices table
  - Update spend_ledger with committed status

charge.succeeded:
  - Insert to spend_ledger
  - Update session total_cost_cents

meter_event.created:
  - Insert to meter_events table
  - Link to session if applicable
```

#### 4. x402 Buyer/CDP Integration

**Flow:**
```
1. Call canSpend() → get approval + reservation
2. GET /enrich?doi=10.1234/xyz (unauthenticated)
   ← 402 Payment Required
   { price: "0.005 ETH", payTo: "0x...", network: "base-sepolia" }

3. CDP Wallet signs payment:
   - Load wallet from CDP_API_KEY_ID + CDP_API_KEY_SECRET
   - Create transfer transaction
   - Sign with wallet private key

4. GET /enrich?doi=10.1234/xyz
   X-PAYMENT: <signed-tx-hash>
   ← 200 OK + enriched data + X-PAYMENT-RESPONSE

5. Commit reservation:
   - UPDATE policy_reservations SET committed=true
   - INSERT spend_ledger (status='committed', metadata={tx_hash, receipt})
   
6. On failure:
   - Release reservation (expires naturally or delete)
   - INSERT spend_ledger (status='failed')
```

---

### Phase 2: Backend API Routes

#### Session Management

```
POST /api/session
Body: { userId?: string }
Response: { sessionId, status, totalCostCents, remainingBudget }

GET /api/session/:id
Response: { session, artifacts, totalCost, ledger[] }

GET /api/session/:id/artifacts
Response: { artifacts: [{ id, type, s3Key, createdAt }] }
```

#### Research Workflow

```
POST /api/session/:id/search
Body: { query: string, maxResults?: number }
Logic:
  1. Query Crossref, OpenAlex, Unpaywall APIs
  2. Score each article:
     score = 0.45*relevance + 0.25*citationNorm + 0.15*openAccess + 0.15*recency
  3. Filter: score >= 0.62 AND price <= remaining budget
  4. Return ranked list with cost estimates
Response: { articles: [{ doi, title, score, estimatedCost, source }] }

POST /api/session/:id/enrich
Body: { dois: string[] }
Logic:
  1. For each DOI:
     a. Check canSpend(estimatedCost)
     b. Execute x402/CDP payment flow
     c. Store enriched data in artifacts
     d. Commit reservation
  2. Return enrichment results + receipts
Response: { enriched: [{ doi, data, cost, txHash }], totalCost }

POST /api/session/:id/synthesize
Body: { prompt?: string }
Logic:
  1. Gather all enriched data + original query
  2. Call Claude with system prompt:
     "You are LitPay Research Assistant. Cite sources; prefer open access."
     Temperature: 0.3, MaxTokens: 2000
  3. Generate markdown report with citations + decision log
  4. Store as artifact (type='report')
Response: { reportId, markdown, citations[], decisionLog[] }
```

#### Policy Check

```
POST /api/policy/can-spend
Body: { amountCents, sessionId, provider, tag? }
Response: { allow, remainingBudgetCents, reason? }
```

---

### Phase 3: Frontend (Next.js)

#### Routes
```
GET /                    → Landing page
GET /session/:id         → Live session view
POST /upload             → PDF/MD upload
WS /ws/:sessionId        → Real-time progress stream
GET /settings            → Policy configuration
```

#### UI Wireframes

**1. Home Page**
- Upload dropzone (PDF/MD, max 20MB)
- Budget pill showing remaining daily budget
- Recent sessions list (status, cost, created date)

**2. Session Page**
- Left panel: Progress steps
  - Discovery (searching APIs)
  - Enrichment (purchasing data)
  - Synthesis (generating report)
- Right panel: Live log + running costs
- Cost breakdown by provider

**3. Report View**
- Top: Summary section
- Middle: Markdown content with inline citations
- Right sidebar:
  - Transaction receipts
  - Stripe invoices
  - Export PDF button

**4. Settings**
- Policy sliders:
  - Daily budget (0-10000¢)
  - Session cap (0-5000¢)
  - Per-call max (0-1000¢)
- Stripe connection status
- CDP wallet address display
- Download audit logs

---

## 🔄 Key Workflows

### Discovery Workflow
1. User submits research query
2. System queries free APIs:
   - Crossref (DOI metadata)
   - OpenAlex (citations, authors)
   - Unpaywall (OA availability)
3. Scoring algorithm:
   ```
   score = 0.45 * relevance_score +
           0.25 * normalized_citations +
           0.15 * is_open_access +
           0.15 * recency_decay
   ```
4. Filter: `score >= 0.62` AND `price <= remaining_budget`
5. Return ranked list

### Enrichment Workflow
1. For each selected article:
   ```
   a. canSpend(estimatedCost) → { allow: true }
   b. GET /seller/enrich?doi=X → 402
   c. Extract payment details
   d. CDP wallet signs transaction
   e. Retry with X-PAYMENT header
   f. Store enriched claims
   g. Commit reservation
   h. Record in spend_ledger
   ```
2. Handle failures:
   - Log failed transactions
   - Release reservations
   - Continue with remaining DOIs

### Synthesis Workflow
1. Collect all enriched data + original query
2. Build Claude prompt:
   ```
   System: You are LitPay Research Assistant. Cite sources; prefer open access.
   
   Context: [enriched data]
   Query: [user question]
   
   Generate a comprehensive report with:
   - Executive summary
   - Key findings with citations
   - Decision log (why each source was chosen)
   - Cost-benefit analysis
   ```
3. Temperature: 0.3, MaxTokens: 2000
4. Parse response into structured markdown
5. Store as artifact
6. Generate PDF export

---

## 📊 Data Stores

### Postgres
- **sessions**: Track research sessions
- **policy_reservations**: 15min TTL pre-reservations
- **spend_ledger**: All transactions (7 year retention)
- **artifacts**: S3 references for uploads/reports
- **invoices**: Stripe billing records
- **meter_events**: Usage metrics

### Redis (Optional for MVP)
- Embeddings cache (30 day TTL)
- Session state cache
- Rate limiting counters

### S3/MinIO
- User uploads (PDF, MD)
- Generated reports (PDF, MD)
- Transaction receipts (JSON)
- 90 day retention policy

---

## 🚦 Testing Strategy

### Unit Tests
- Policy engine rule validation
- Reservation TTL expiry logic
- Webhook signature verification
- Scoring algorithm accuracy
- Budget calculation edge cases

### Integration Tests
- x402 flow: 402 → sign → retry → 200
- Stripe webhook processing
- CDP wallet signing
- Database transactions
- Idempotency handling

### E2E Tests
- Full research session:
  1. Upload query
  2. Discovery returns results
  3. Enrichment purchases data
  4. Synthesis generates report
  5. Export PDF
- Budget exhaustion scenarios
- Concurrent session handling

### Chaos Tests
- Drop 10% of webhooks → verify replay
- Simulate x402 seller downtime
- Database connection failures
- CDP signing timeouts

---

## 🎯 Beta Phase (Weeks 3-4)

### Metering Dashboards
- Cost by session, provider, time period
- Daily/weekly/monthly aggregations
- Budget utilization graphs
- Top spending sessions

### Cost Forecasting
- Predict session costs based on query complexity
- Warn users before exceeding budgets
- Suggest budget adjustments

### Multi-Provider Support
- Add additional enrichment APIs
- Per-provider spending caps
- Fallback providers

### Performance SLOs
- p95 end-to-end latency < 20s
- 99.9% webhook success rate
- Ledger drift < $0.01/day
- Uptime > 99.5%

---

## 🏆 GA Phase (Weeks 5-6)

### Multi-User Support
- Per-tenant budgets
- User authentication (OAuth)
- Role-based access control
- Team sharing

### Compliance & Audit
- SOC-2 controls implementation
- GDPR right-to-delete flow
- PCI scope isolation (Stripe tokens only)
- Audit log exports (CSV, JSON)
- Tamper-evident hashing

### Admin Controls
- Global spend limits
- Provider enable/disable
- Emergency circuit breakers
- Incident response runbook
- Webhook replay dashboard

---

## 🔧 Current Status

✅ **Completed:**
- Environment configuration
- Basic server with Stripe webhook
- CDP wallet setup
- Implementation plan finalized

🚧 **In Progress:**
- Database schema creation
- Local Policy Engine
- x402/CDP buyer module

📋 **Next Up:**
- Session API endpoints
- Discovery workflow
- Frontend scaffolding

---

## 📝 Notes

### Environment Variables Required
```
POSTGRES_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CDP_API_KEY_ID
CDP_API_KEY_SECRET
ANTHROPIC_API_KEY
POLICY_DAILY_BUDGET_CENTS=5000
POLICY_SESSION_CAP_CENTS=1500
POLICY_PER_CALL_MAX_CENTS=500
POLICY_PROVIDER_X402_DAILY_CEILING_CENTS=3000
```

### Key Dependencies
- express: Web framework
- stripe: Payment processing
- @coinbase/coinbase-sdk: CDP wallet
- pg: Postgres client
- anthropic-ai: Claude API
- axios: HTTP client for x402

### Development Commands
```bash
npm start              # Start server
npm run verify         # Verify environment
npm test               # Run tests
npm run migrate        # Run DB migrations
stripe listen          # Listen for webhooks
```
