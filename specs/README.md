
# LitPay /specs (No Locus)

**Date:** 2025-11-15

This pack defines a Locus‑free variant of LitPay. A lightweight **Local Policy Engine** replaces remote policy orchestration. All budget checks, per‑call caps, and spend guards run in‑process with persistent audit logs.

## What changed vs. prior design
- Removed any dependency on *Locus* (services, SDKs, webhooks).
- Added **Local Policy Engine** with pluggable rules: daily budget, per‑session caps, per‑provider ceilings.
- Updated x402 Buyer/CDP sequence to call seller endpoints directly after local checks.
- Stripe remains for settlement/metering; webhooks update local ledger.

## Diagram
See `litpay_system_design_nolocus.png` for topology, sequence, persistence, and guardrails.

## Contents
- `contracts.md` — API contracts (agent <-> buyer, buyer <-> seller, Stripe webhooks)
- `routes.md` — HTTP routes (frontend, backend, webhooks)
- `env.schema.md` — environment configuration
- `payments.md` — x402 Buyer/CDP + Stripe flows
- `persistence.md` — storage & retention
- `prompts.md` — prompt frames & synthesis controls
- `scoring.md` — ranking & utility scoring
- `ui-wireframes.md` — wireframe notes
- `runbook.md` — ops & incident response
- `quality.md` — test strategy
- `roadmap.md` — phasing
- `compliance.md` — privacy, security, and financial controls
- `references.md` — standards & links
