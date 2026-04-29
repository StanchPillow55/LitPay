# 🗺️ Repo Map - LitPay

**What it is:** AI research assistant with autonomous budget management, enabling agents to purchase gated academic content via x402/CDP micropayments with local policy enforcement.
**Evidence:** `README.md:3-5`

**Who it's for:** Developers building AI agents that need to programmatically acquire paywalled research content within budget constraints.

---

## 📁 Key Directories

| Directory | Purpose | Evidence |
|-----------|---------|----------|
| `/` (root) | Backend Express server + core modules | `server.js`, `policy.js`, `db.js` |
| `/frontend` | Next.js 14 web application | `frontend/app/`, `frontend/components/` |
| `/migrations` | Database schema migrations | `migrate.js` references |
| `/specs` | System specifications | `README.md:281-287` |
| `/uploads` | User-uploaded files (PDF/MD) | `server.js` multer config |

---

## 🚪 Entry Points

### Backend
- **Main server:** `server.js:14-15` — Express app on PORT 3000
- **Database:** `db.js:4-10` — PostgreSQL pool connection
- **Policy engine:** `policy.js:23` — `canSpend()` function
- **x402 payments:** `x402-buyer.js` — Payment flow handler

### Frontend
- **Home page:** `frontend/app/page.tsx` — File upload + recent sessions
- **Session view:** `frontend/app/session/[id]/page.tsx` — Live progress
- **Report view:** `frontend/app/session/[id]/report/page.tsx` — Research report

---

## ⚙️ How to Run/Build/Test

### Backend
```bash
# Install
npm install

# Configure
cp .env.example .env  # Edit with credentials

# Migrate database
npm run migrate

# Start server
npm start  # Runs on http://localhost:3000
```
**Evidence:** `package.json:3-4`, `README.md:51-71`

### Frontend
```bash
cd frontend
npm install
npm run dev  # Runs on http://localhost:3001
```
**Evidence:** `QUICKSTART.md:52-65`

### Tests
```bash
npm run test:policy      # Policy engine (9/9 tests)
npm run test:x402        # x402 payment flow (3/3 tests)
npm run test:concurrency # Race condition safety
npm run test:api         # API endpoints (6/6 tests)
./test-e2e.sh            # Full workflow
```
**Evidence:** `package.json:8-12`, `QUICKSTART.md:37-46`

---

## 🔑 Configuration

**Primary config:** `.env` file (see `.env.example`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `POSTGRES_URL` | Database connection | Required |
| `STRIPE_SECRET_KEY` | Stripe API key | Required |
| `CDP_API_KEY_ID` | Coinbase Developer Platform | Required for x402 |
| `POLICY_DAILY_BUDGET_CENTS` | Daily spend limit | 5000 (=$50) |
| `POLICY_SESSION_CAP_CENTS` | Per-session limit | 1500 (=$15) |
| `POLICY_PER_CALL_MAX_CENTS` | Per-call limit | 500 (=$5) |

**Evidence:** `README.md:207-228`, `policy.js:5-11`
