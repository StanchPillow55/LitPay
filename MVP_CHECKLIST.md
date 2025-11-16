# LitPay MVP Success Metrics Checklist

**Last Updated:** 2025-11-15

**See also:**
- **WARP.md** - LLM accountability guidelines
- **METRICS.md** - Quantitative success metrics with validation thresholds

---

## ✅ Core Deliverables for MVP (Weeks 1–2)

### 1. Backend

#### Database Schema & Migrations
- [x] **sessions** table created with proper schema
- [x] **policy_reservations** table with TTL support
- [x] **spend_ledger** table for transaction logging
- [x] **artifacts** table for S3 references
- [x] **invoices** table for Stripe records
- [x] **meter_events** table for usage tracking
- [x] **webhook_events** table for idempotency
- [x] Migration script (migrate.js) functional
- [x] Database indexes created
- [x] Cleanup functions for expired reservations

#### Local Policy Engine
- [x] **canSpend()** function implemented
- [x] Daily budget enforcement ($50 / 5000¢)
- [x] Per-session cap enforcement ($15 / 1500¢)
- [x] Per-call max enforcement ($5 / 500¢)
- [x] x402 daily ceiling enforcement ($30 / 3000¢)
- [x] 15-minute TTL reservations
- [x] **commitReservation()** function
- [x] **releaseReservation()** function
- [x] **getBudgetStatus()** function
- [x] Transaction safety for concurrency
- [x] **TESTED**: Policy engine with real database

#### API Routes
- [x] **POST /api/session** - Create session
- [x] **GET /api/session/:id** - Get status & costs
- [ ] **POST /api/session/:id/search** - Discovery workflow
- [ ] **POST /api/session/:id/enrich** - x402/CDP flow
- [ ] **POST /api/session/:id/synthesize** - Claude synthesis
- [x] **POST /api/policy/can-spend** - Budget check endpoint
- [x] **GET /api/session/:id/artifacts** - List artifacts
- [x] **TESTED**: Implemented endpoints with curl

#### Stripe Webhook Handler
- [x] Basic webhook endpoint created
- [x] Signature verification implemented
- [x] Idempotency checking (using webhook_events table)
- [x] **invoice.paid** handler with ledger upsert
- [x] **charge.succeeded** handler with ledger upsert
- [ ] **meter_event.created** handler
- [x] **TESTED**: Webhook with `stripe trigger`

#### x402 Buyer Module
- [ ] 402 response detection
- [ ] CDP wallet integration
- [ ] Payment signing with CDP
- [ ] Retry with X-PAYMENT header
- [ ] Receipt parsing and storage
- [ ] Error handling & reservation release
- [ ] **TESTED**: Full 402 → pay → retry flow

#### x402 Seller Microservice
- [ ] **/enrich/claims** endpoint created
- [ ] Returns 402 for unauthenticated requests
- [ ] Validates X-PAYMENT header
- [ ] Returns enriched data + X-PAYMENT-RESPONSE
- [ ] Fixed price (e.g., $0.01 / 1¢)
- [ ] **TESTED**: End-to-end with buyer

---

### 2. Frontend (Next.js)

#### Pages
- [ ] **/** - Home page with upload & budget pill
- [ ] **/session/:id** - Live progress view
- [ ] **/session/:id/report** - Report with citations & receipts
- [ ] **/settings** - Policy configuration

#### Components
- [ ] Upload dropzone (PDF/MD, 20MB max)
- [ ] Budget pill (remaining daily budget)
- [ ] Candidate article list with OA badges
- [ ] U-score display per article
- [ ] "Why we paid" decision log
- [ ] Citation list with DOI links
- [ ] Export buttons (PDF/JSON/MD)
- [ ] Live cost tracker
- [ ] Progress stepper (Discovery → Enrich → Synthesize)

#### Testing
- [ ] **TESTED**: Upload flow
- [ ] **TESTED**: Session view updates
- [ ] **TESTED**: Report export

---

### 3. Claude Integration

- [ ] Anthropic SDK installed and configured
- [ ] System prompt implemented
- [ ] Synthesis endpoint calls Claude API
- [ ] Temperature: 0.3, MaxTokens: 2000
- [ ] Structured markdown output
- [ ] Citations extracted and formatted
- [ ] Decision log generated
- [ ] Token metering for Stripe usage events
- [ ] **TESTED**: Synthesis with real Claude API

---

### 4. Object Storage

- [ ] S3/MinIO client configured
- [ ] Upload endpoint stores PDFs
- [ ] Report storage working
- [ ] Receipt storage working
- [ ] 90-day retention policy configured
- [ ] Pre-signed URLs for downloads
- [ ] **TESTED**: Upload & download flow

---

### 5. Testing

#### Unit Tests
- [ ] Policy rules validation
- [ ] Reservation TTL expiry logic
- [ ] Webhook signature verification
- [ ] Budget calculation edge cases
- [ ] Scoring algorithm accuracy

#### Integration Tests
- [ ] x402 flow: 402 → sign → retry → 200
- [ ] Stripe test mode webhooks
- [ ] CDP wallet signing
- [ ] Database transactions
- [ ] Idempotency handling

#### E2E Tests
- [ ] Full session: upload → search → enrich → synthesize → export
- [ ] Budget exhaustion scenarios
- [ ] Concurrent session handling
- [ ] Payment failure handling

---

## ✅ Artifacts to Deliver

- [ ] **Working app** - Next.js + API + DB + Stripe + x402/CDP
- [ ] **.env.example** - With placeholders and comments
- [x] **Database migrations** - schema.sql & migrate.js
- [ ] **Seed script** - Starter data for demo sessions
- [ ] **Architecture diagram** - litpay_system_design_nolocus.png (exists in specs/)
- [ ] **Specs pack** - specs_nolocus_pack.zip
- [ ] **Demo script** - 7-minute flow for judges
- [ ] **README.md** - Setup instructions and runbook

---

## 🎯 Current Progress Summary

### ✅ Completed (6/6 Backend Core)
1. Database schema & migrations - **100%** ✅
2. Database layer (db.js) - **100%** ✅
3. Local Policy Engine - **100%** ✅ TESTED
4. Session API endpoints - **100%** ✅ TESTED
5. Enhanced Stripe webhook handler - **90%** ✅ TESTED
6. Background cleanup job - **100%** ✅

### 🚧 In Progress (0/3 Remaining Backend)
7. x402/CDP buyer module - **0%**
8. Research workflow endpoints (search/enrich/synthesize) - **0%**
9. x402 seller microservice - **0%**

### 📋 Not Started
- Frontend (0 pages)
- Claude integration
- Object storage
- Testing suite (unit/integration/e2e)
- Documentation

---

## 📊 Overall MVP Completion: ~35%

**Next Checkpoint:** Implement x402/CDP buyer module & test payment flow
