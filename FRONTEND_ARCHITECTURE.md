# LitPay Frontend Architecture

**Framework:** Next.js 14+ (App Router)  
**Version:** 1.0  
**Last Updated:** 2025-11-15

---

## Overview

The frontend is a Next.js application that provides the UI for LitPay's AI research assistant. It handles file uploads, session management, live progress tracking, and report viewing.

**Key Requirements (from METRICS.md):**
- 3 pages implemented: `/`, `/session/:id`, report view
- PDF/MD upload up to 20MB with client-side validation
- Live progress updates ≥1 Hz during search/enrich
- Time to first results ≤8s
- 100% of paid items show tx hash and cost

---

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Home page (upload + recent sessions)
│   ├── session/
│   │   └── [id]/
│   │       ├── page.tsx        # Session detail page
│   │       └── report/
│   │           └── page.tsx    # Report view page
│   ├── settings/
│   │   └── page.tsx            # Policy configuration
│   └── api/                    # API route handlers (optional proxy)
│       └── upload/
│           └── route.ts
│
├── components/
│   ├── upload/
│   │   ├── FileDropzone.tsx   # Drag-and-drop file upload
│   │   └── UploadValidator.tsx # Client-side validation
│   ├── session/
│   │   ├── SessionList.tsx    # Recent sessions list
│   │   ├── ProgressSteps.tsx  # Discovery → Enrich → Synthesis
│   │   ├── LiveLog.tsx        # Real-time progress log
│   │   └── CostBreakdown.tsx  # Provider cost breakdown
│   ├── report/
│   │   ├── ReportViewer.tsx   # Markdown report renderer
│   │   ├── CitationCard.tsx   # Citation with tx details
│   │   └── ExportButtons.tsx  # PDF/MD/HTML export
│   ├── policy/
│   │   ├── BudgetSlider.tsx   # Budget configuration
│   │   └── PolicyOverview.tsx # Current limits display
│   └── shared/
│       ├── BudgetPill.tsx     # Remaining budget indicator
│       ├── LoadingSpinner.tsx
│       └── ErrorBoundary.tsx
│
├── lib/
│   ├── api-client.ts          # Backend API wrapper
│   ├── websocket.ts           # WebSocket/SSE connection
│   ├── validators.ts          # File validation logic
│   └── formatters.ts          # Currency, date formatters
│
├── hooks/
│   ├── useSession.ts          # Session state management
│   ├── useLiveProgress.ts     # WebSocket progress hook
│   └── useBudget.ts           # Budget info hook
│
├── types/
│   └── api.ts                 # TypeScript API types
│
└── public/
    └── icons/                 # SVG icons

package.json                   # Dependencies
next.config.js                 # Next.js configuration
tsconfig.json                  # TypeScript config
tailwind.config.ts             # Tailwind CSS config
```

---

## Pages

### 1. Home Page (`/`)

**Purpose:** Upload research queries and view recent sessions

**Components:**
- `FileDropzone`: Accept PDF/MD files up to 20MB
- `UploadValidator`: Client-side validation (file type, size)
- `SessionList`: Recent sessions with status, cost, date
- `BudgetPill`: Display remaining daily budget

**Validations:**
- File type: `.pdf` or `.md` only
- File size: ≤ 20MB (20,971,520 bytes)
- Error messages displayed inline
- 0% error rate on valid files (METRICS.md 2.1)

**API Calls:**
```typescript
POST /api/session          // Create new session
POST /api/upload           // Upload file
GET  /api/sessions         // List recent sessions
GET  /api/policy/budget    // Get remaining budget
```

**State:**
- `uploadProgress`: 0-100%
- `validationErrors`: string[]
- `recentSessions`: Session[]
- `remainingBudget`: number (cents)

---

### 2. Session Page (`/session/:id`)

**Purpose:** Live view of research session progress

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  LitPay                         Budget: $45.23 remaining │
├──────────────────┬──────────────────────────────────────┤
│                  │                                       │
│  Progress Steps  │          Live Log                    │
│                  │                                       │
│  1. Discovery    │  [12:34:56] Querying Crossref...     │
│     ✓ Complete   │  [12:34:57] Found 127 results        │
│                  │  [12:34:58] Scoring articles...      │
│  2. Enrichment   │  [12:35:01] Top 15 candidates        │
│     → Active     │  [12:35:02] Checking budget...       │
│     3/15 paid    │  [12:35:03] ✓ DOI: 10.1234/xyz      │
│                  │             Cost: 50¢ | Tx: 0xabc... │
│  3. Synthesis    │  [12:35:05] ✓ DOI: 10.1234/abc      │
│     Pending      │             Cost: 50¢ | Tx: 0xdef... │
│                  │                                       │
├──────────────────┴──────────────────────────────────────┤
│  Cost Breakdown:                                         │
│  x402: $1.50 (3 enrichments)                            │
│  Stripe: $0.00                                           │
│  Total: $1.50                                            │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- `ProgressSteps`: Visual stepper (Discovery → Enrich → Synthesis)
- `LiveLog`: Scrollable log with timestamps
- `CostBreakdown`: Real-time cost by provider

**Real-time Updates:**
- WebSocket connection to `/ws/:sessionId` or SSE
- Update frequency: ≥1 Hz (METRICS.md 2.1)
- Connection drop rate: <1% over 10 min

**API Calls:**
```typescript
GET  /api/session/:id           // Session details
WS   /ws/:sessionId             // Live progress stream
GET  /api/session/:id/ledger    // Spending history
```

**State:**
- `session`: Session
- `progressLogs`: LogEntry[]
- `currentStep`: 'discovery' | 'enrichment' | 'synthesis'
- `ledger`: LedgerEntry[]
- `wsConnected`: boolean

---

### 3. Report Page (`/session/:id/report`)

**Purpose:** View and export generated research report

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Research Report                    [Export: PDF|MD|HTML]│
├────────────────────────────┬────────────────────────────┤
│                            │                             │
│  # Background              │  Transaction Receipts       │
│                            │                             │
│  Transformers architecture │  DOI: 10.1234/xyz          │
│  revolutionized NLP [1].   │  Cost: 50¢                  │
│                            │  Provider: x402             │
│  ## Key Findings           │  Tx: 0xabc123...            │
│                            │  Block: 12345678            │
│  - Finding 1               │  Timestamp: 2025-11-15      │
│  - Finding 2 [2]           │  Status: ✓ Confirmed        │
│                            │                             │
│  ## References             │  DOI: 10.1234/abc          │
│                            │  Cost: 50¢                  │
│  [1] Attention Is All...   │  Provider: x402             │
│  [2] BERT: Pre-training... │  Tx: 0xdef456...            │
│                            │                             │
│  ## Decision Log           │  Total Session Cost: $1.50  │
│                            │                             │
│  - Selected 3 papers       │  [View Full Invoice →]      │
│  - Budget: $1.50/$15.00    │                             │
└────────────────────────────┴────────────────────────────┘
```

**Components:**
- `ReportViewer`: Markdown renderer with syntax highlighting
- `CitationCard`: Citation with tx hash, cost, block info
- `ExportButtons`: Generate PDF/MD/HTML exports

**Export Requirements (METRICS.md 2.2):**
- HTML/MD/PDF available
- Each export ≤2s render time (dev)
- 100% of paid items show tx hash and cost

**API Calls:**
```typescript
GET  /api/session/:id/report           // Fetch report
GET  /api/session/:id/artifacts        // Get receipts
POST /api/session/:id/export?format=pdf // Generate export
```

**State:**
- `report`: { markdown, citations, decisionLog }
- `receipts`: TransactionReceipt[]
- `exportLoading`: boolean

---

### 4. Settings Page (`/settings`) (Optional for MVP)

**Purpose:** Configure policy limits and view connection status

**Components:**
- `BudgetSlider`: Adjust daily budget, session cap, per-call max
- `PolicyOverview`: Current limits with visual indicators
- Connection status for Stripe, CDP wallet

**API Calls:**
```typescript
GET  /api/policy            // Current policy
PATCH /api/policy           // Update policy
GET  /api/health            // Service health
```

---

## API Client

**File:** `lib/api-client.ts`

```typescript
class LitPayAPI {
  private baseUrl: string;
  
  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }
  
  // Sessions
  async createSession(userId?: string): Promise<Session> { }
  async getSession(sessionId: string): Promise<Session> { }
  async getSessions(): Promise<Session[]> { }
  
  // Upload
  async uploadFile(file: File, sessionId: string): Promise<Artifact> { }
  
  // Research workflow
  async search(sessionId: string, query: string): Promise<Article[]> { }
  async enrich(sessionId: string, dois: string[]): Promise<EnrichResult> { }
  async synthesize(sessionId: string, prompt?: string): Promise<Report> { }
  
  // Policy
  async checkBudget(): Promise<BudgetInfo> { }
  async canSpend(amount: number, context: SpendContext): Promise<PolicyDecision> { }
  
  // Artifacts
  async getArtifacts(sessionId: string): Promise<Artifact[]> { }
  async exportReport(sessionId: string, format: 'pdf' | 'md' | 'html'): Promise<Blob> { }
}

export const api = new LitPayAPI();
```

---

## WebSocket / SSE Connection

**File:** `lib/websocket.ts`

```typescript
export function connectToSession(sessionId: string): EventSource {
  const url = `${API_URL}/events/${sessionId}`;
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Emit to React state
  };
  
  return eventSource;
}

export interface ProgressEvent {
  type: 'discovery' | 'enrichment' | 'synthesis';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  metadata?: {
    doi?: string;
    cost?: number;
    txHash?: string;
    count?: number;
  };
  timestamp: string;
}
```

**Update Frequency:** ≥1 Hz during active operations (METRICS.md 2.1)

---

## File Validation

**File:** `lib/validators.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUploadFile(file: File): ValidationResult {
  const errors: string[] = [];
  
  // Check file type
  const allowedTypes = ['application/pdf', 'text/markdown'];
  const allowedExtensions = ['.pdf', '.md'];
  
  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExt = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  
  if (!hasValidType && !hasValidExt) {
    errors.push('File must be PDF or Markdown (.pdf or .md)');
  }
  
  // Check file size (20MB max)
  const maxSize = 20 * 1024 * 1024; // 20,971,520 bytes
  if (file.size > maxSize) {
    errors.push(`File size (${formatBytes(file.size)}) exceeds 20MB limit`);
  }
  
  // Check file name
  if (file.name.length > 255) {
    errors.push('File name is too long (max 255 characters)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
```

**Error Rate Target:** 0% on valid files (METRICS.md 2.1)

---

## State Management

**Approach:** React Server Components + Client Components with hooks

**No external state library needed for MVP** — use:
- React Server Components for initial data fetching
- `useState` + `useEffect` for client interactivity
- Custom hooks for shared logic (`useSession`, `useLiveProgress`)
- Context providers only if needed for theme/auth

**Data Flow:**
```
Server Components (RSC)
    ↓ fetch initial data
Client Components
    ↓ useSession, useLiveProgress hooks
    ↓ WebSocket/SSE updates
Local State (useState)
    ↓ re-render
UI Components
```

---

## TypeScript Types

**File:** `types/api.ts`

```typescript
export interface Session {
  id: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'failed';
  totalCostCents: number;
}

export interface Article {
  doi: string;
  title: string;
  authors: string[];
  year: number;
  score: number;
  estimatedCostCents: number;
  source: 'crossref' | 'openalex' | 'unpaywall';
  isOpenAccess: boolean;
  citations: number;
}

export interface LedgerEntry {
  id: string;
  sessionId: string;
  provider: 'x402' | 'stripe';
  amountCents: number;
  status: 'pending' | 'committed' | 'failed';
  metadata: {
    doi?: string;
    txHash?: string;
    blockNumber?: number;
    timestamp: string;
  };
  createdAt: string;
}

export interface Report {
  id: string;
  markdown: string;
  citations: Citation[];
  decisionLog: DecisionLogEntry[];
}

export interface Citation {
  doi: string;
  title: string;
  authors: string[];
  cost: number;
  txHash: string;
}

export interface PolicyDecision {
  allow: boolean;
  remainingBudgetCents: number;
  reason?: string;
}

export interface BudgetInfo {
  dailyBudgetCents: number;
  dailySpentCents: number;
  remainingCents: number;
  sessionCapCents: number;
  perCallMaxCents: number;
}
```

---

## Styling

**Framework:** Tailwind CSS

**Theme:**
- Primary: Indigo (`indigo-600`)
- Success: Green (`green-500`)
- Warning: Yellow (`yellow-500`)
- Error: Red (`red-500`)
- Background: White/Gray (`gray-50`)

**Responsive:** Mobile-first (breakpoints: sm, md, lg, xl)

**Components:**
- Use `shadcn/ui` for base components (optional)
- Custom components styled with Tailwind

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "eslint": "^8.55.0",
    "eslint-config-next": "^14.0.0"
  }
}
```

---

## Performance Targets

From METRICS.md:

1. **Time to first results:** ≤8s (upload → candidate list)
2. **Live progress updates:** ≥1 Hz during search/enrich
3. **Connection drop rate:** <1% over 10-min demo
4. **Export render time:** ≤2s per format (dev)

**Optimization strategies:**
- Server-side initial data fetch (RSC)
- Streaming responses for large reports
- Debounced WebSocket reconnection
- Lazy-load heavy components (PDF viewer, export)
- Optimistic UI updates for uploads

---

## Testing Strategy

**Unit Tests:**
- File validation logic
- Formatters (currency, dates)
- API client methods (mocked)

**Integration Tests:**
- Upload flow (file → session → redirect)
- Live progress updates (WebSocket mock)
- Export generation (blob download)

**E2E Tests (Playwright):**
- Full user flow: upload → session → report → export
- Budget exhaustion scenario
- Connection failure handling

---

## Environment Variables

```bash
# Frontend-specific
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Feature flags
NEXT_PUBLIC_ENABLE_SETTINGS=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

---

## Next Steps

1. **Scaffold Next.js project:**
   ```bash
   cd frontend
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
   ```

2. **Install dependencies:**
   ```bash
   npm install axios react-markdown remark-gfm date-fns
   ```

3. **Create directory structure:**
   ```bash
   mkdir -p app/session/[id]/report
   mkdir -p components/{upload,session,report,policy,shared}
   mkdir -p lib hooks types
   ```

4. **Implement pages in order:**
   - Home page (upload + sessions list)
   - Session page (live progress)
   - Report page (view + export)

5. **Test against metrics:**
   - Run validation tests
   - Measure performance (time to first results, export speed)
   - Verify live updates frequency

---

## Success Criteria

**METRICS.md 2.1 (Pages & UX):**
- ✅ 3 pages implemented
- ✅ PDF/MD upload up to 20MB
- ✅ Client-side validation with 0% error rate on valid files
- ✅ Live progress ≥1 Hz
- ✅ Connection drop rate <1%

**METRICS.md 2.2 (Usability):**
- ✅ Time to first results ≤8s
- ✅ 100% of paid items show tx hash and cost
- ✅ Export actions available, ≤2s render time

---

## References

- **Architecture:** `specs/litpay_system_design_nolocus.png`
- **Backend API:** `server.js`, `IMPLEMENTATION_PLAN.md`
- **Success Metrics:** `METRICS.md`
- **Next.js Docs:** https://nextjs.org/docs
