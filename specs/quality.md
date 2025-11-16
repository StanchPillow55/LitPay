
# Quality & Tests

- Unit: policy rules, reservation TTL, idempotent webhook handler.
- Integration: 402 round‑trip against sandbox seller; Stripe test mode webhooks.
- E2E: happy‑path session with synthetic PDF.
- Non‑func: load test 10 rps enrich; chaos: drop 10% webhooks and verify replay.
