# LitPay

**AI Research Assistant with Autonomous Budget Management**

LitPay enables AI agents to autonomously purchase gated academic content through x402/CDP micropayments while maintaining strict budget controls via a local policy engine.

---

## 🎯 Overview

LitPay combines:
- **x402/CDP micropayments** for enriched research data
- **Stripe** for user billing and metering
- **Local Policy Engine** for budget enforcement (no external dependencies)
- **Discovery APIs** (Crossref, OpenAlex, Unpaywall)
- **Structured synthesis** (Claude-ready)

**MVP Status:** Backend complete (96%), 28/56 metrics validated

---

## 📋 Features

### Core Capabilities
- ✅ **Multi-source discovery**: Crossref + OpenAlex + Unpaywall
- ✅ **Utility scoring**: Weighted algorithm (relevance, citations, OA, recency)
- ✅ **x402 payment flow**: 402 → pay → retry with CDP wallet
- ✅ **Budget enforcement**: Daily, per-session, per-call, and provider limits
- ✅ **Stripe integration**: Webhooks with idempotency
- ✅ **Audit trail**: Complete spend ledger (7-year retention)

### Policy Engine Rules
- Daily budget: $50 (5000¢)
- Per-session cap: $15 (1500¢)
- Per-call maximum: $5 (500¢)
- x402 daily ceiling: $30 (3000¢)
- Reservation TTL: 15 minutes

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Stripe CLI (for webhook testing)
- CDP account (for x402 payments)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd LitPay

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run migrate

# Seed demo data (optional)
npm run seed

# Start server
npm start
```

Server runs at `http://localhost:3000`

---

## 📡 API Endpoints

### Session Management

```bash
# Create session
POST /api/session
Body: { "userId": "user123" }

# Get session details
GET /api/session/:id

# Get artifacts
GET /api/session/:id/artifacts
```

### Research Workflow

```bash
# Discovery (search)
POST /api/session/:id/search
Body: {
  "query": "machine learning transformers",
  "maxResults": 20,
  "minScore": 0.62
}

# Enrichment (purchase)
POST /api/session/:id/enrich
Body: {
  "dois": ["10.1234/xyz", "10.5678/abc"]
}

# Synthesis (generate report)
POST /api/session/:id/synthesize
Body: {
  "query": "research query",
  "enrichedData": [...]
}
```

### Policy

```bash
# Check budget
POST /api/policy/can-spend
Body: {
  "amountCents": 100,
  "sessionId": "uuid",
  "provider": "x402"
}
```

---

## 🧪 Testing

```bash
# Verify environment
npm run verify

# Run all tests
npm run test:policy    # Policy engine tests
npm run test:x402      # x402 payment flow tests
npm run test:api       # API endpoint tests
npm run test:e2e       # End-to-end workflow test

# Manual testing
curl http://localhost:3000/
```

### Test Results

- Policy Engine: ✅ 9/9 tests passed
- x402 Flow: ✅ 3/3 tests passed (mock payment)
- API Endpoints: ✅ 6/6 working
- E2E Workflow: ✅ Complete (search → enrich → synthesize)

---

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  (Next.js - planned)
│   (Web UI)  │
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────┐
│           Express API Server                │
│  ┌────────────┐  ┌──────────────────────┐  │
│  │  Routes    │  │  Policy Engine       │  │
│  │  Handlers  │──│  (Budget Controls)   │  │
│  └────────────┘  └──────────────────────┘  │
└───┬────────┬──────────┬──────────┬─────────┘
    │        │          │          │
    │        │          │          │
┌───▼──┐  ┌─▼──────┐ ┌─▼────────┐ ┌▼────────┐
│ DB   │  │ Stripe │ │ x402/CDP │ │Discovery│
│(Postgres)│(Webhooks)│(Payments)│ │ APIs    │
└──────┘  └────────┘ └──────────┘ └─────────┘
```

### Key Components

**Backend Modules:**
- `server.js` - Express server with all endpoints
- `db.js` - PostgreSQL connection & query layer
- `policy.js` - Local policy engine
- `x402-buyer.js` - x402 payment flow handler
- `discovery.js` - Multi-source research discovery
- `x402-seller-mock.js` - Mock seller for testing

**Database Tables:**
- `sessions` - Research sessions
- `policy_reservations` - 15-min TTL pre-reservations
- `spend_ledger` - All transactions (7-year retention)
- `artifacts` - Uploads, reports, receipts
- `invoices` - Stripe billing
- `meter_events` - Usage tracking
- `webhook_events` - Idempotency

---

## 🔧 Configuration

### Environment Variables

See `.env.example` for full configuration. Key variables:

```bash
# Database
POSTGRES_URL=postgresql://user:pass@localhost:5432/litpay

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CDP/x402
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_NETWORK=base-sepolia

# Discovery APIs
RESEARCH_CONTACT_EMAIL=your-email@example.com

# Policy Limits (cents)
POLICY_DAILY_BUDGET_CENTS=5000
POLICY_SESSION_CAP_CENTS=1500
POLICY_PER_CALL_MAX_CENTS=500
POLICY_PROVIDER_X402_DAILY_CEILING_CENTS=3000
```

---

## 📊 Success Metrics

**Current Progress: 28/56 metrics (50%)**

### Backend Core: 25/26 (96%)
- ✅ Database schema & migrations
- ✅ Local policy engine
- ✅ API routes (7/7)
- ✅ Stripe webhooks
- ✅ x402 buyer module
- ✅ x402 seller mock
- ✅ Discovery integration

### Testing: 4/10 (40%)
- ✅ Policy engine validated
- ✅ x402 flow validated
- ✅ API endpoints validated
- ✅ E2E workflow validated

### Documentation: 3/3 (100%)
- ✅ .env.example
- ✅ README
- ✅ Seed script

See `METRICS.md` for detailed validation criteria.

---

## 📁 Project Structure

```
LitPay/
├── server.js              # Main Express server
├── db.js                  # Database layer
├── policy.js              # Budget policy engine
├── x402-buyer.js          # x402 payment flow
├── x402-seller-mock.js    # Mock enrichment seller
├── discovery.js           # Multi-source discovery
├── schema.sql             # Database schema
├── migrate.js             # Migration script
├── seed.js                # Demo data seeder
├── verify-env.js          # Environment validator
├── test-*.js/sh           # Test suites
├── .env.example           # Environment template
├── package.json           # Dependencies & scripts
├── IMPLEMENTATION_PLAN.md # Detailed implementation plan
├── METRICS.md             # Success metrics
├── MVP_CHECKLIST.md       # Feature checklist
├── WARP.md                # LLM accountability guidelines
└── specs/                 # System specifications
    ├── README.md
    ├── contracts.md
    ├── routes.md
    ├── payments.md
    └── ...
```

---

## 🎮 Usage Examples

### Example 1: Discovery

```bash
# Create session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId": "researcher1"}' | jq -r '.sessionId')

# Search for articles
curl -X POST http://localhost:3000/api/session/$SESSION_ID/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "transformer neural networks",
    "maxResults": 10
  }' | jq '.articles[] | {title, score, is_oa}'
```

### Example 2: Enrichment

```bash
# Enrich articles (use mock DOIs for testing)
curl -X POST http://localhost:3000/api/session/$SESSION_ID/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "dois": ["10.1234/test", "10.5678/demo"]
  }' | jq '{successCount, totalCost}'
```

### Example 3: Budget Check

```bash
# Check if spend is allowed
curl -X POST http://localhost:3000/api/policy/can-spend \
  -H "Content-Type: application/json" \
  -d '{
    "amountCents": 100,
    "sessionId": "'$SESSION_ID'",
    "provider": "x402"
  }' | jq '{allow, remainingBudgetCents, reason}'
```

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check Postgres is running
psql $POSTGRES_URL -c "SELECT 1"

# Re-run migrations
npm run migrate
```

### Stripe Webhook Issues
```bash
# Get webhook secret from Stripe CLI
stripe listen --print-secret

# Update .env with the secret
STRIPE_WEBHOOK_SECRET=whsec_...

# Test webhook
stripe trigger charge.succeeded
```

### x402 Seller Not Running
```bash
# Start mock seller in separate terminal
node x402-seller-mock.js

# Verify it's running
curl http://localhost:3001/health
```

---

## 📚 Documentation

- **IMPLEMENTATION_PLAN.md** - Detailed technical plan
- **METRICS.md** - Quantitative success criteria
- **MVP_CHECKLIST.md** - Feature completion status
- **WARP.md** - LLM accountability guidelines
- **specs/** - Complete system specifications

---

## 🛣️ Roadmap

### ✅ MVP (Weeks 1-2) - COMPLETE
- Backend API (96% complete)
- Policy engine
- x402 payment flow
- Discovery integration
- Testing & documentation

### 📋 Beta (Weeks 3-4)
- Frontend (Next.js)
- Claude integration
- Metering dashboards
- Cost forecasting
- Multi-provider enrichers

### 🚀 GA (Weeks 5-6)
- Multi-user support
- SOC-2 compliance
- Admin controls
- Audit exports
- GDPR delete flow

---

## 🤝 Contributing

1. Follow accountability guidelines in `WARP.md`
2. Validate against metrics in `METRICS.md`
3. Run tests before committing
4. Update documentation

---

## 📄 License

[License Type] - See LICENSE file

---

## 🔗 Links

- [CDP Documentation](https://docs.cdp.coinbase.com/)
- [Stripe API](https://stripe.com/docs/api)
- [Crossref API](https://api.crossref.org/)
- [OpenAlex](https://docs.openalex.org/)
- [Unpaywall](https://unpaywall.org/products/api)

---

## 💡 Support

For issues or questions:
- Check troubleshooting section
- Review test scripts for examples
- See specs/ directory for detailed specifications

---

**Built with accountability** - See `WARP.md` for development guidelines
