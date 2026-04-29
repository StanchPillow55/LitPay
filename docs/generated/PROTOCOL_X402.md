# 🔐 x402/CDP Protocol - LitPay

---

## What is x402?

**HTTP 402 Payment Required** is an HTTP status code reserved for future use. LitPay implements it as a micropayment protocol where:

1. Client requests gated content without payment credentials
2. Server responds with 402 + payment details
3. Client executes blockchain payment via CDP (Coinbase Developer Platform)
4. Client retries request with payment proof (transaction hash)
5. Server verifies payment and returns content

**Evidence:** `x402-buyer.js:56-63`, `x402-seller-mock.js:62-74`

---

## CDP (Coinbase Developer Platform)

**Definition:** CDP is Coinbase's SDK for building Web3 applications. LitPay uses it to:

- Create and manage buyer wallets
- Sign and broadcast payment transactions
- Query wallet balances

**SDK:** `@coinbase/coinbase-sdk` (version ^0.25.0)
**Evidence:** `package.json:17`, `x402-buyer.js:2`

### Configuration

| Environment Variable | Purpose | Required |
|---------------------|---------|----------|
| `CDP_API_KEY_ID` | CDP API key identifier | Yes |
| `CDP_API_KEY_SECRET` | CDP API private key | Yes |
| `CDP_NETWORK` | Blockchain network | No (default: `base-sepolia`) |
| `X402_BUYER_WALLET_ID` | Existing wallet to import | No |

**Evidence:** `x402-buyer.js:15-17`, `x402-buyer.js:36`

### Network

**Current:** Base Sepolia (testnet)
- Chain: Ethereum L2 (Base)
- Environment: Test/development
- Explorer: `https://sepolia.basescan.org/tx/<txHash>`

**Production would require:** Base Mainnet or Ethereum Mainnet

**Evidence:** `x402-seller-mock.js:72`, `x402-buyer.js:163`

---

## Protocol Flow

### Request/Response Sequence

```
Buyer (LitPay)                         Seller (Content Provider)
     │                                        │
     ├──GET /enrich/claims?doi=10.1234/xyz ──▶│
     │   Headers: x-client-id: litpay-buyer   │
     │                                        │
     │◀───────── 402 Payment Required ────────┤
     │   Body: {                              │
     │     price: 0.01,                       │
     │     priceCents: 1,                     │
     │     payTo: "0x9a04...",                │
     │     assetId: "eth",                    │
     │     network: "base-sepolia"            │
     │   }                                    │
     │                                        │
     ├─────── [Execute CDP Payment] ──────────┤
     │                                        │
     ├──GET /enrich/claims?doi=10.1234/xyz ──▶│
     │   Headers:                             │
     │     x-client-id: litpay-buyer          │
     │     X-PAYMENT: 0xabc123...             │
     │     X-PAYMENT-NETWORK: base-sepolia    │
     │                                        │
     │◀─────────── 200 OK ────────────────────┤
     │   Body: {enriched content...}          │
```

**Evidence:** `x402-buyer.js:76-165`, `x402-seller-mock.js:45-126`

---

## Headers Specification

### Request Headers (Buyer → Seller)

| Header | Required | Format | Purpose |
|--------|----------|--------|---------|
| `x-client-id` | Yes | String | Identifies buyer application |
| `X-PAYMENT` | After 402 | `0x[64 hex chars]` | Transaction hash |
| `X-PAYMENT-NETWORK` | After 402 | String | Network identifier (e.g., `base-sepolia`) |

### 402 Response Body

```typescript
interface PaymentRequired {
  error: "Payment Required";
  price: number;           // Amount in token units (e.g., 0.01 ETH)
  priceCents: number;      // Amount in cents (e.g., 1)
  payTo: string;           // Recipient address (0x...)
  assetId: string;         // Token identifier (e.g., "eth")
  network: string;         // Blockchain network
  message: string;         // Human-readable instruction
}
```

**Evidence:** `x402-seller-mock.js:66-74`

---

## Receipt Format

**What constitutes a valid receipt:**

1. Transaction hash from successful blockchain payment
2. Format: `0x` + 64 hexadecimal characters
3. Must be verifiable on the specified network's blockchain explorer

**Storage location:** `spend_ledger.metadata` (JSONB column)

```json
{
  "txHash": "0x1a2b3c4d...",
  "doi": "10.1234/xyz",
  "price": 0.01,
  "payTo": "0x9a04...",
  "timestamp": "2025-11-15T12:00:00Z"
}
```

**Evidence:** `policy.js:173-180`, `test-x402.js:92-98`

---

## Retry Semantics

**How retry is performed:**

1. Same endpoint URL with same query parameters
2. Same `x-client-id` header
3. Additional headers: `X-PAYMENT` (tx hash), `X-PAYMENT-NETWORK`
4. **NOT** a different endpoint

**Retry failure handling:**
- If payment accepted but content request fails (non-200): Error logged, payment already committed
- If seller returns 409 (duplicate payment): Payment was already used, treat as error

**Evidence:** `x402-buyer.js:156-169`, `x402-seller-mock.js:86-93`

---

## Error Cases

| HTTP Status | Meaning | Buyer Action |
|-------------|---------|--------------|
| 402 | Payment required | Execute payment, retry with receipt |
| 400 | Invalid payment format | Abort, log error |
| 404 | DOI not found | Abort, report to user |
| 409 | Payment already used | Abort, double-spend detected |
| 500 | Seller error | Release reservation, abort |

**Evidence:** `x402-seller-mock.js:55-108`, `x402-buyer.js:212-232`

---

## Budget Integration

Before executing payment, buyer checks local policy engine:

```javascript
const policyResult = await policy.canSpend(priceCents, {
  sessionId: session.id,
  provider: 'x402',
  tag: 'enrichment'
});

if (!policyResult.allow) {
  return { success: false, error: policyResult.reason };
}

// Store reservationId for later commit/release
reservationId = policyResult.reservationId;
```

**On success:** `commitReservation(reservationId, sessionId, {txHash, doi, ...})`
**On failure:** `releaseReservation(reservationId, sessionId, {error})`

**Evidence:** `x402-buyer.js:113-132`, `x402-buyer.js:171-180`, `x402-buyer.js:216-225`

---

## Wallet Lifecycle

### Initialization (`initializeCDP`)

1. Configure SDK with API credentials
2. Check for existing wallet ID in env
3. If exists: Import wallet from JSON file
4. If not: Create new wallet, save to file

**Wallet file format:** `buyer-wallet-<walletId>.json`

**Evidence:** `x402-buyer.js:11-54`

### Payment Execution

```javascript
const transfer = await defaultAddress.invokeContract({
  contractAddress: paymentDetails.payTo,
  method: 'transfer',
  args: {
    amount: paymentDetails.price,
    assetId: paymentDetails.assetId || 'eth'
  }
});

await transfer.wait();  // Wait for confirmation
const txHash = transfer.getTransactionHash();
```

**Evidence:** `x402-buyer.js:140-153`

---

## Mock Seller (`x402-seller-mock.js`)

**Purpose:** Local testing without real blockchain payments

**Port:** 3001 (configurable via `X402_SELLER_PORT`)

**Endpoints:**
- `GET /enrich/claims?doi=...` — Enrichment with payment gate
- `GET /health` — Health check
- `GET /stats` — Payment statistics

**Mock DOIs available:**
- `10.1234/test`
- `10.5678/demo`

**Payment validation:** Checks format (`0x` prefix, length > 10), tracks used payments in-memory Set

**Evidence:** `x402-seller-mock.js:1-153`
