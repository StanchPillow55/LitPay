# LitPay Frontend

Next.js application for LitPay - AI Research Assistant with Budget Management.

## Features

- **File Upload**: Drag-and-drop file upload with client-side validation (PDF/MD up to 20MB)
- **Live Progress**: Real-time session progress tracking with visual steps
- **Cost Transparency**: Real-time cost breakdown by provider with transaction receipts
- **Report Generation**: View and export research reports in PDF/MD/HTML formats
- **Budget Display**: Live budget tracking with remaining balance indicator

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Markdown**: react-markdown + remark-gfm
- **Date Formatting**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local to point to your backend API
# NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Development

```bash
# Run development server
npm run dev

# Open http://localhost:3001 in your browser
```

### Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with navigation
│   ├── page.tsx                # Home page (upload + sessions)
│   ├── session/
│   │   └── [id]/
│   │       ├── page.tsx        # Session detail with live progress
│   │       └── report/
│   │           └── page.tsx    # Report view with exports
│   └── globals.css             # Global styles
│
├── components/
│   ├── upload/
│   │   └── FileDropzone.tsx   # File upload with validation
│   ├── session/
│   │   ├── ProgressSteps.tsx  # Visual progress stepper
│   │   ├── LiveLog.tsx        # Live event log
│   │   └── CostBreakdown.tsx  # Provider cost breakdown
│   └── shared/
│       ├── Button.tsx          # Reusable button component
│       └── BudgetPill.tsx      # Budget indicator
│
├── lib/
│   ├── api-client.ts          # Backend API wrapper
│   ├── validators.ts          # File validation logic
│   └── formatters.ts          # Currency, date formatters
│
├── types/
│   └── api.ts                 # TypeScript API types
│
└── public/                    # Static assets
```

## API Integration

The frontend communicates with the LitPay backend API:

- `POST /api/session` - Create new session
- `GET /api/session/:id` - Get session details
- `POST /api/upload` - Upload research file
- `GET /api/session/:id/ledger` - Get spending history
- `GET /api/session/:id/export` - Export report

## File Validation

Upload validation (METRICS.md 2.1):
- File types: PDF or Markdown (.pdf, .md)
- Max size: 20MB (20,971,520 bytes)
- Max filename: 255 characters
- 0% error rate on valid files

## Performance

- **Time to first results**: ≤8s (upload → candidate list)
- **Live updates**: ≥1 Hz during operations (polling every 2s)
- **Export render**: ≤2s per format

## Environment Variables

```bash
# Required
NEXT_PUBLIC_API_URL=http://localhost:3000

# Optional
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_ENABLE_SETTINGS=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

## Testing

The frontend implements client-side validation with comprehensive error handling:

1. **File validation**: Type, size, and filename checks
2. **API error handling**: Network failures, validation errors
3. **Loading states**: Visual feedback during async operations

## Success Criteria

✅ **METRICS.md 2.1 (Pages & UX):**
- 3 pages implemented (/, /session/:id, /session/:id/report)
- PDF/MD upload up to 20MB with client-side validation
- Live progress tracking with visual indicators
- Budget display with remaining balance

✅ **METRICS.md 2.2 (Usability):**
- Export actions available (PDF/MD/HTML)
- 100% of paid items show tx hash and cost
- Responsive design (mobile-first with Tailwind)

## License

Part of the LitPay MVP project.
