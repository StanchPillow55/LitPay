
# Contracts

## 1) Agent ↔ Local Policy Engine
```ts
// canSpend(amountCents: number, context: { sessionId: string; provider: 'x402'|'stripe'; tag?: string })
// Returns: { allow: boolean; remainingBudgetCents: number; reason?: string }
```
- **Rules:** dailyBudget, perSessionCap, perCallMax, perProviderDailyCeiling.
- **Side‑effects:** on allow, pre‑reserve `amountCents` in SQL; auto‑expire reservation after 15m.

## 2) Agent ↔ x402 Buyer/CDP
```http
GET /enrich?doi=10.1234/abcd HTTP/1.1
x-client-id: <public>
// Expect: 402 Payment Required
```
```http
GET /enrich?doi=10.1234/abcd HTTP/1.1
x-client-id: <public>
X-PAYMENT: <CDP-signed-payment>
// 200 OK with enrichment JSON + X-PAYMENT-RESPONSE
```

## 3) Stripe Webhooks → Backend
Endpoint: `POST /webhooks/stripe`
- `invoice.paid`, `payment_link.created`, `charge.succeeded`
- **Verify**: `Stripe-Signature` header; reject if timestamp skew > 5m.
- **Upserts:** `spend_ledger`, `invoice`, `customer`, `meter_events`.

## 4) Upload Store
- Accepts PDF/Markdown; max 20MB; virus scan; content-type whitelist.
- Emits `ObjectCreated` event to kick off embedding pipeline.
