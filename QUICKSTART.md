# LitPay - Quick Start Guide

**MVP Status:** Backend 100% Complete | Frontend 100% Complete

---

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Stripe CLI (for webhooks)
- CDP API credentials (optional for MVP testing)

---

## Backend Setup

```bash
cd /Users/bradleyharaguchi/LitPay

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Run database migrations
npm run migrate

# 4. Start backend server
npm start
# → Backend running on http://localhost:3000
```

### Test Backend
```bash
# Run tests
npm run test:policy      # Policy engine tests (9/9)
npm run test:x402        # x402 payment tests (3/3)
npm run test:concurrency # Race condition test (PASSES ✓)
npm run test:api         # API endpoint tests (6/6)

# Full E2E test
./test-e2e.sh
```

---

## Frontend Setup

```bash
cd /Users/bradleyharaguchi/LitPay/frontend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Default: NEXT_PUBLIC_API_URL=http://localhost:3000

# 3. Start development server
npm run dev
# → Frontend running on http://localhost:3001
```

### Build Frontend
```bash
npm run build  # Production build
npm start      # Start production server
```

---

## Complete Flow

### Terminal 1: Backend
```bash
cd /Users/bradleyharaguchi/LitPay
npm start
```

### Terminal 2: Frontend
```bash
cd /Users/bradleyharaguchi/LitPay/frontend
npm run dev
```

### Terminal 3: Stripe Webhooks (Optional)
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

---

## Testing the Application

1. **Open Frontend:** http://localhost:3001

2. **Upload File:**
   - Create a test markdown file: `echo "# Test Query" > test.md`
   - Drag and drop or click to upload
   - Click "Start Research Session"

3. **Watch Progress:**
   - View live session at `/session/:id`
   - Monitor progress steps (Discovery → Enrichment → Synthesis)
   - Check cost breakdown by provider

4. **View Report:**
   - Click "View Report" when session completes
   - See markdown-rendered research report
   - Export to PDF/MD/HTML

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Frontend      │  HTTP   │   Backend API    │
│  (Next.js 14)   │────────▶│  (Express.js)    │
│  Port: 3001     │         │  Port: 3000      │
└─────────────────┘         └──────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────▼────┐   ┌─────▼─────┐   ┌────▼────┐
              │PostgreSQL│   │  x402/CDP  │   │ Stripe  │
              │ Database │   │  Payments  │   │Webhooks │
              └──────────┘   └────────────┘   └─────────┘
```

---

## Key Files

### Backend
- `server.js` - Express API server (384 lines)
- `policy.js` - Budget policy engine (297 lines)
- `db.js` - Database layer (323 lines)
- `x402-buyer.js` - Payment flow handler (311 lines)
- `discovery.js` - Multi-source discovery (290 lines)

### Frontend
- `app/page.tsx` - Home page with upload
- `app/session/[id]/page.tsx` - Live session progress
- `app/session/[id]/report/page.tsx` - Report viewer
- `lib/api-client.ts` - Backend API wrapper
- `components/` - Reusable UI components

---

## Success Metrics (METRICS.md)

### Backend (26/26 Complete ✓)
- ✅ Database schema with 7 tables
- ✅ Policy engine with concurrency safety
- ✅ x402/CDP buyer implementation
- ✅ Stripe webhook handler
- ✅ Discovery (Crossref, OpenAlex, Unpaywall)
- ✅ All API endpoints functional
- ✅ Concurrency test passing (3/10 approved, no overspend)

### Frontend (8/8 Complete ✓)
- ✅ 3 pages (Home, Session, Report)
- ✅ File upload with validation (20MB, PDF/MD)
- ✅ Live progress tracking (0.5 Hz polling)
- ✅ Cost breakdown by provider
- ✅ Transaction receipts with tx hashes
- ✅ Export buttons (PDF/MD/HTML)
- ✅ Budget display with remaining balance
- ✅ Responsive design (Tailwind CSS)

---

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running: `psql litpay_dev -c "SELECT 1"`
- Verify .env file exists and has correct values
- Run migrations: `npm run migrate`

### Frontend build fails
- Clear cache: `rm -rf .next node_modules && npm install`
- Check Node version: `node --version` (should be 18+)

### Database errors
- Reset database: `node reset-db.js`
- Re-run migrations: `npm run migrate`
- Check PostgreSQL logs

### CORS errors
- Ensure backend has CORS enabled for frontend origin
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`

---

## Next Steps

1. ✅ Backend implementation complete
2. ✅ Frontend implementation complete
3. ✅ Local integration testing
4. ⏭️ Deploy backend to production
5. ⏭️ Deploy frontend to Vercel/Netlify
6. ⏭️ Configure production environment variables
7. ⏭️ Set up monitoring and logging

---

**Status:** 🎉 **MVP COMPLETE AND READY FOR DEPLOYMENT**

Backend: 26/26 metrics (100%)
Frontend: 8/8 components (100%)
Total Lines: ~3,500 (backend) + ~1,500 (frontend) = 5,000 lines
