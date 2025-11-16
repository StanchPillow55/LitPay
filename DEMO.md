# LitPay Demo Script (7 Minutes)

**Version:** 1.0  
**Target Duration:** 7:00 ± 0:30  
**Last Updated:** 2025-11-15

---

## Overview

This demo showcases LitPay's AI research assistant with autonomous micropayments for academic content. The script follows a complete research workflow from upload through report generation.

**Success Criteria (METRICS.md):**
- Total duration: 7 min ± 30s
- Demonstrates all 3 core workflows (Discovery, Enrichment, Synthesis)
- Shows budget enforcement and transaction receipts
- Displays real tx hashes and costs for paid content

---

## Pre-Demo Setup (5 minutes before)

**Environment Check:**
```bash
# 1. Verify services running
npm run verify

# 2. Start backend
npm start &

# 3. Start mock seller (separate terminal)
node x402-seller-mock.js &

# 4. Reset database to clean state
npm run migrate
npm run seed

# 5. Verify budget
curl http://localhost:3000/api/policy/budget
# Expected: dailyBudgetCents: 5000, remainingCents: 5000
```

**Browser Setup:**
- Open `http://localhost:3000` (home page)
- Open dev console (to show network activity)
- Open `http://localhost:3001/enrich/claims?doi=10.1234/test` (verify mock seller)
- Prepare demo query file: `demo-query.md`

**Demo Query Content:**
```markdown
# Research Query: Transformer Architectures in NLP

I need a comprehensive review of transformer-based models in natural language processing, 
focusing on:
- Original attention mechanism (Vaswani et al.)
- BERT and bidirectional transformers
- GPT series and autoregressive models
- Recent efficiency improvements (2020-2023)

Target audience: Graduate students in ML/NLP
Budget: Willing to pay for high-citation papers
```

---

## Demo Flow

### [0:00 - 1:00] Introduction & Problem Statement

**Script:**
> "Today I'm showing LitPay, an AI research assistant that autonomously purchases access to academic content using micropayments.
>
> The problem: Researchers waste hours finding, purchasing, and synthesizing literature. Existing tools don't handle paywalled content, and manual purchasing is tedious.
>
> LitPay solves this by combining:
> - Free discovery APIs (Crossref, OpenAlex)
> - x402 micropayments for paywalled content
> - Local budget enforcement
> - AI synthesis with Claude
>
> Let's walk through a real research session."

**Actions:**
- Show home page
- Point to budget indicator: "$50.00 remaining today"
- Show recent sessions list (seeded data from `npm run seed`)

**Timing Check:** 1:00

---

### [1:00 - 2:00] Upload & Session Creation

**Script:**
> "I'll start by uploading my research query. LitPay accepts PDF or Markdown files up to 20MB."

**Actions:**
1. Drag `demo-query.md` into dropzone
2. Show client-side validation: ✓ File type, ✓ Size (< 20MB)
3. Click "Start Research Session"
4. Show network request:
   - `POST /api/session` → Session created
   - `POST /api/upload` → File uploaded
5. Redirect to `/session/:id`

**Expected Output:**
```
✓ Session created: abc123
✓ Uploaded: demo-query.md (1.2 KB)
Initializing discovery...
```

**Timing Check:** 2:00

---

### [2:00 - 3:30] Discovery Phase

**Script:**
> "Now LitPay queries free academic APIs to find relevant papers. It scores each paper based on:
> - Relevance to the query (45%)
> - Citation count (25%)
> - Open access availability (15%)
> - Recency (15%)
>
> Watch the live log on the right."

**Actions:**
1. Show progress steps: "1. Discovery → Active"
2. Show live log updating in real-time:
   ```
   [12:34:00] Querying Crossref API...
   [12:34:01] Found 127 results
   [12:34:02] Querying OpenAlex for citations...
   [12:34:03] Cross-referencing Unpaywall...
   [12:34:04] Scoring 127 articles...
   [12:34:05] Top 15 candidates (score ≥ 0.62)
   [12:34:06] Estimated cost: $1.50 for 3 enrichments
   [12:34:07] ✓ Discovery complete
   ```
3. Show candidate list (if UI ready):
   - DOI, title, score, estimated cost
   - Filter: "Paywalled: 3 | Open Access: 12"

**Expected Timing:** Discovery completes in ≤8s (METRICS.md 2.2)

**Timing Check:** 3:30

---

### [3:30 - 5:00] Enrichment Phase (x402 Micropayments)

**Script:**
> "LitPay selected 3 paywalled papers worth enriching. Let's watch it make micropayments autonomously.
>
> For each paper:
> 1. Check budget with local policy engine
> 2. Request paper from seller → 402 Payment Required
> 3. CDP wallet signs payment on Base Sepolia
> 4. Retry with payment proof → 200 OK + enriched data
>
> Notice the budget countdown on each transaction."

**Actions:**
1. Show progress steps: "2. Enrichment → Active (0/3)"
2. Show live log with transaction details:
   ```
   [12:34:08] Enriching 3 papers...
   [12:34:09] Checking budget for DOI: 10.1234/xyz
   [12:34:10]   ✓ Approved: 50¢ | Remaining: $49.50
   [12:34:11] GET /enrich?doi=10.1234/xyz → 402 Payment Required
   [12:34:12]   Price: 50¢ | PayTo: 0x1234...
   [12:34:13] CDP Wallet signing payment...
   [12:34:15] Tx submitted: 0xabc123def456...
   [12:34:17] Retry with X-PAYMENT header → 200 OK
   [12:34:18] ✓ Enriched: Attention Is All You Need (Vaswani et al.)
   [12:34:18]   Cost: 50¢ | Tx: 0xabc123def456...
   
   [12:34:19] Checking budget for DOI: 10.1234/abc
   [12:34:20]   ✓ Approved: 50¢ | Remaining: $49.00
   [12:34:21] GET /enrich?doi=10.1234/abc → 402 Payment Required
   [12:34:25] ✓ Enriched: BERT (Devlin et al.)
   [12:34:25]   Cost: 50¢ | Tx: 0xdef456ghi789...
   
   [12:34:26] Checking budget for DOI: 10.1234/ghi
   [12:34:27]   ✓ Approved: 50¢ | Remaining: $48.50
   [12:34:32] ✓ Enriched: GPT-3 (Brown et al.)
   [12:34:32]   Cost: 50¢ | Tx: 0xghi789jkl012...
   
   [12:34:33] ✓ Enrichment complete: 3/3 successful
   [12:34:33]   Total cost: $1.50
   ```

3. Show cost breakdown:
   ```
   x402: $1.50 (3 enrichments)
   Stripe: $0.00
   Total: $1.50
   ```

4. Point out budget pill: "$48.50 remaining today"

**Expected Timing:** Each enrichment ~5-10s, total ≤90s for 3 papers

**Timing Check:** 5:00

---

### [5:00 - 6:00] Synthesis Phase

**Script:**
> "Now Claude synthesizes the enriched data into a structured report.
>
> The prompt instructs Claude to:
> - Cite sources with DOI references
> - Prefer open access when available
> - Include a decision log explaining choices
>
> Temperature is set to 0.3 for consistency."

**Actions:**
1. Show progress steps: "3. Synthesis → Active"
2. Show live log:
   ```
   [12:34:34] Gathering enriched data...
   [12:34:35] Calling Claude API (temp: 0.3, max_tokens: 2000)
   [12:34:40] Generating Background section...
   [12:34:45] Generating Methods section...
   [12:34:50] Generating Findings section...
   [12:34:55] Generating References & Decision Log...
   [12:35:00] ✓ Synthesis complete (1,847 tokens)
   [12:35:01] Report saved: artifact_xyz123
   ```

3. Show completion: "✓ Session complete | Total cost: $1.50 | View Report →"

**Expected Timing:** Synthesis ≤15s (METRICS.md 1.3)

**Timing Check:** 6:00

---

### [6:00 - 7:00] Report View & Transaction Receipts

**Script:**
> "Here's the final report. Notice two key features:
>
> 1. **Inline citations** with DOI links
> 2. **Transaction receipts** showing exactly what we paid for
>
> This is the accountability promise: 100% of paid content shows tx hash, cost, and blockchain confirmation."

**Actions:**
1. Click "View Report" → Navigate to `/session/:id/report`
2. Scroll through report sections:
   - Background (with citations)
   - Methods
   - Key Findings
   - References
   - Decision Log
3. Show right sidebar: "Transaction Receipts"
   ```
   DOI: 10.1234/xyz
   Title: Attention Is All You Need
   Cost: 50¢
   Provider: x402
   Tx Hash: 0xabc123def456...
   Block: 12345678
   Status: ✓ Confirmed
   ```
4. Click "Export PDF" → Download in <2s
5. Show final budget: "$48.50 remaining today"

**Timing Check:** 7:00

---

## Wrap-Up

**Script:**
> "To recap:
> - **Discovery:** Found 127 papers in 8 seconds
> - **Enrichment:** Autonomously purchased 3 paywalled papers for $1.50
> - **Synthesis:** Generated a structured report with citations
> - **Accountability:** Every transaction is recorded on-chain
>
> LitPay enforces budgets locally with the policy engine. No overspending.
>
> Next steps for this project:
> - Multi-user support with per-tenant budgets
> - Stripe metering for billing reconciliation
> - Cost forecasting to predict session costs
>
> Questions?"

---

## Backup Scenarios

### If Discovery Fails (Network Error)
**Recovery:**
- Show cached results from seed data
- Explain: "In production, we'd retry with exponential backoff"

### If Enrichment Fails (CDP Error)
**Recovery:**
- Show ledger entry with `status: 'failed'`
- Explain: "Reservation is released automatically; budget is not charged"

### If Synthesis Fails (Claude Timeout)
**Recovery:**
- Show partial progress in artifacts
- Explain: "We'd retry with shorter context or fallback to summarization"

### If Budget is Exceeded
**Recovery:**
- Trigger manually: Set `POLICY_SESSION_CAP_CENTS=100` before demo
- Show policy denial:
  ```
  ❌ Budget exceeded
  Reason: Session cap reached (100¢/150¢)
  Remaining budget: $0.00
  ```
- Explain: "This is the local policy engine preventing overspend"

---

## Success Metrics

**METRICS.md 6: Demo Script**
- ✅ Steps enumerated
- ✅ Dry-run matches within ±30s (test with `time bash demo-dry-run.sh`)

**Visual Proof Points:**
1. Client-side file validation (0% error on valid files)
2. Live progress updates ≥1 Hz
3. Time to first results ≤8s
4. 100% of paid items show tx hash and cost
5. Export render time ≤2s

---

## Post-Demo Cleanup

```bash
# Stop services
pkill -f "node server.js"
pkill -f "node x402-seller-mock.js"

# Reset database for next demo
npm run migrate

# Check for uncommitted secrets
git status
```

---

## Demo Variations

### 3-Minute Lightning Demo
- Skip: Discovery log details, synthesis progress
- Show: Upload → Enrichment (1 paper) → Report → Receipt

### 15-Minute Deep Dive
- Add: Policy configuration, budget exhaustion scenario
- Add: Webhook replay, Stripe metering dashboard
- Add: Code walkthrough (policy engine, x402 buyer module)

---

## Appendix: Demo Commands

```bash
# Dry-run timing test (no network calls)
time bash demo-dry-run.sh

# Verify all endpoints
./test-api.sh

# Check policy rules
node test-policy.js

# Test x402 flow
node test-x402.js

# Full e2e test
./test-e2e.sh
```

---

## References

- **Architecture:** `specs/litpay_system_design_nolocus.png`
- **Implementation Plan:** `IMPLEMENTATION_PLAN.md`
- **Success Metrics:** `METRICS.md`
- **Frontend Spec:** `FRONTEND_ARCHITECTURE.md`
