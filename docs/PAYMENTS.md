# Payments

## Status

| Provider | State | Notes |
| --- | --- | --- |
| `mock` | **Working** | Full ledger, simulated settlement. Default for development |
| `mpesa` | **Integration-ready, not verified** | Daraja shapes implemented; not exercised against a live sandbox |

The M-Pesa provider **refuses to start** if it is selected without complete
configuration, rather than failing silently later. Payouts and reversals return
`NOT_IMPLEMENTED` with an explanation instead of pretending to succeed.

## The ledger

Double-entry, append-only, integer minor units (KES cents).

### Wallets

| Kind | Owner | Buckets |
| --- | --- | --- |
| `WORKER` | A worker | `available` (spendable), `pending` (escrowed for them) |
| `EMPLOYER` | An employer | `available`, `escrow` (committed to live work) |
| `PLATFORM` | None (singleton) | `available` (fee revenue) |
| `ESCROW` | None (singleton) | Reserved for rails that hold funds externally |

### Lifecycle

```
deposit         provider → employer.available
holdInEscrow    employer.available → employer.escrow
                worker.pending += net            ← the worker sees it is funded
release         employer.escrow -= gross
                worker.pending -= net, worker.available += net
                platform.available += fee
refund          employer.escrow → employer.available   (full, or split)
payout          worker.available -= amount, then the provider call
```

Escrow is the platform's answer to *"will I actually get paid?"*. A worker is
never invited to start work that is not funded: `holdInEscrow` runs in the same
logical step as accepting them, and if the employer's balance is short the
transaction aborts and nobody is assigned.

Approval and release are likewise a single operation. An employer cannot accept
work and leave a worker waiting for money.

### Guarantees

| Guarantee | How |
| --- | --- |
| No negative balance | `CHECK (balance >= 0)` on every bucket |
| No rewriting history | Append-only trigger on `transactions` |
| No double payment | Release is idempotent; a second call is a no-op |
| No double charge | `UNIQUE (idempotency_key)` |
| No lost money on provider failure | Provider calls sit outside the transaction; a failed payout credits the wallet back |
| No concurrent-read races | Wallet rows locked `FOR UPDATE` before read-modify-write |
| Fee arithmetic always sums | `CHECK (net_amount + platform_fee = gross_amount)` |

`reconcileWallet()` verifies a wallet's balance against the sum of its ledger
entries. A mismatch is a serious bug, and the integration suite asserts the
whole demo dataset reconciles.

## Fees

`PLATFORM_FEE_BPS` (default 1000 = 10%) applies to task payments only.

The worker sees their **net** figure on the task page, before applying — not
after the work is done. Job postings are free during the pilot, and **workers
are never charged**: no fee to apply, no fee to access work. That is a hard
product rule, stated on the landing page and in the FAQ.

## Disputes

Opening a dispute freezes the escrowed funds — neither party can move them. An
administrator resolves it in favour of the worker, the employer, or as a split,
with a written reason recorded and sent to both parties. There is no automated
resolution path.

A split is implemented as a partial refund: the worker keeps their share less
the platform fee on that share, and the remainder returns to the employer.

---

## M-Pesa go-live checklist

Work through this before setting `PAYMENT_PROVIDER=mpesa` in production.

### 1. Safaricom onboarding
- [ ] Complete Daraja onboarding and obtain a production shortcode (paybill or
      till) and API credentials.
- [ ] Register validation and confirmation URLs with Safaricom.
- [ ] Confirm settlement timing and reconciliation reporting with your bank.

### 2. Configuration
```bash
PAYMENT_PROVIDER=mpesa
MPESA_ENVIRONMENT=production
MPESA_CONSUMER_KEY=…
MPESA_CONSUMER_SECRET=…
MPESA_SHORTCODE=…
MPESA_PASSKEY=…
MPESA_CALLBACK_URL=https://your-domain/api/webhooks/mpesa
```

### 3. Verify in sandbox
- [ ] STK push completes and the callback arrives.
- [ ] `verifyPayment` correctly reports success, cancellation (`ResultCode`
      1032) and timeout.
- [ ] A cancelled push leaves the ledger untouched.
- [ ] A duplicated callback does not double-credit (`UNIQUE (provider,
      provider_reference)` should hold).

### 4. Implement the callback endpoint
Not present in this build. It must:
- [ ] Accept unauthenticated POSTs (Daraja does not sign callbacks).
- [ ] Restrict by source IP at the edge to Safaricom's published ranges.
- [ ] Treat the body as a **hint only** and call `verifyPayment` before
      crediting anything. `parseWebhook` is written on this assumption.
- [ ] Respond 200 quickly; process asynchronously.

### 5. Enable B2C payouts
Currently `NOT_IMPLEMENTED`. Requires:
- [ ] `MPESA_INITIATOR_NAME` and an encrypted `SecurityCredential`.
- [ ] Float funding on the shortcode, with a low-balance alert.
- [ ] Result and timeout URLs registered and handled.
- [ ] Reconciliation between `payouts` and the B2C statement.

### 6. Refunds
Daraja reversal needs the initiator security credential and is operationally
sensitive, so refunds are routed to a B2C payout back to the payer instead —
gated behind the same checklist as payouts.

### 7. Operational readiness
- [ ] Alert on `payments` stuck in `PROCESSING` beyond a threshold.
- [ ] Alert on any `reconcileWallet` mismatch.
- [ ] Daily reconciliation between the ledger and the M-Pesa statement.
- [ ] A documented runbook for a stuck or partial payment.

## Adding another provider

Implement `PaymentProvider` (`initiatePayment`, `verifyPayment`,
`releasePayment`, `refundPayment`, `payout`, `parseWebhook`), register it in
`getPaymentProvider()`, and extend the `PAYMENT_PROVIDER` enum. The ledger is
provider-agnostic and does not change.

Card rails, bank transfer and other African mobile-money networks all fit this
interface.
