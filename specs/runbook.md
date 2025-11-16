
# Runbook

## Provisioning
- Create Postgres, Redis, Object Store.
- Configure Stripe keys & webhook endpoint.
- Load env per `env.schema.md`.

## Operations
- SLOs: p95 end‑to‑end < 20s; 99.9% webhook success; ledger drift < $0.01/day.
- Dashboards: policy denials, 402 retries, webhook failures.

## Incidents
- **Payment loop** (repeated 402): disable enrichment; cap at policy; add circuit breaker.
- **Webhook backlog**: scale queue consumers; replay with idempotency keys.
- **Ledger mismatch**: reconcile with Stripe balance tx; generate diff report.
