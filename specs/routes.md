
# Routes

## Frontend (Next.js)
- `GET /` — landing
- `GET /session/:id` — live report
- `POST /upload` — PDF or MD upload (multipart)
- `WS /ws/:sessionId` — progress stream

## Backend (Agent API)
- `POST /api/session` — create session
- `POST /api/session/:id/search` — run discovery
- `POST /api/session/:id/enrich` — perform x402 enrichment
- `POST /api/session/:id/synthesize` — run Claude synthesis
- `GET /api/session/:id/artifacts` — list artifacts
- `POST /api/policy/can-spend` — local policy check

## Webhooks
- `POST /webhooks/stripe` — Stripe events
