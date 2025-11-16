
# Payments

## x402 Buyer/CDP Flow
1. Agent calls Local Policy `canSpend(amount)`.
2. Buyer makes unauthenticated `GET /enrich` to Seller — expects **402**.
3. Buyer retries with `X-PAYMENT` header (signed by CDP wallet).
4. Seller returns `200` + payload + `X-PAYMENT-RESPONSE` receipt.
5. Agent logs spend reservation → commit on success; release on failure/timeout.

## Stripe Flow
- Use **Payment Links** for user‑visible charges.
- Emit **meter events** for behind‑the‑scenes usage.
- Webhook handler verifies signature and idempotency; updates ledger and session state.
