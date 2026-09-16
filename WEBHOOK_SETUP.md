# Webhook URLs for Payment Gateways

Configure these URLs in your payment gateway dashboards so they know where to send payment notifications.

## Base URL

Your production webhook base URL is:
```
https://crm.diginest.pro
```

## Stripe Webhook

In Stripe Dashboard → Developers → Webhooks → Add endpoint:
- **URL**: `https://crm.diginest.pro/api/payments/webhook`
- **Events to send**:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`
- **Description**: CRM invoice payments

Then copy the signing secret and paste it into:
- Settings → Payment Gateways → Stripe → Webhook Secret

## PayPal Webhook

In PayPal Developer Dashboard → Webhooks → Add webhook:
- **URL**: `https://crm.diginest.pro/api/payments/webhook`
- **Events**:
  - `CHECKOUT.ORDER.APPROVED`
  - `PAYMENT.CAPTURE.COMPLETED`
  - `PAYMENT.CAPTURE.DENIED`
  - `PAYMENT.CAPTURE.REFUNDED`

## SafePay Webhook

SafePay uses **two** endpoints:

| URL | Purpose |
|---|---|
| `https://crm.diginest.pro/api/payments/callback` | Both the **browser redirect** (after payment) and the **server-side webhook POST** |
| `https://crm.diginest.pro/api/payments/webhook` | Alternative webhook endpoint (also accepted) |

### Where to set them in SafePay

In SafePay Merchant Dashboard → Webhooks:
- **URL**: `https://crm.diginest.pro/api/payments/callback`
- **Events**:
  - `payment.succeeded`
  - `payment.failed`

The same URL is also passed to SafePay as the `redirect_url` when a checkout session is created (see `lib/payments.ts`), so the customer's browser lands back on our server after paying.

### Webhook payload format (SafePay v2.0.0)

SafePay SDK >= `2.0.0` (we ship `@sfpy/node-core@0.3.5`) wraps every event in a `"root"` envelope:

```json
{
  "root": {
    "token": "evt_...",
    "version": "2.0.0",
    "merchant_api_key": "sec_...",
    "type": "payment.succeeded",
    "endpoint": "crm.diginest.pro/api/payments/callback",
    "data": {
      "tracker": "track_...",
      "intent": "CYBERSOURCE",
      "state": "TRACKER_ENDED",
      "net": 9366,
      "fee": 634,
      "customer_email": "...",
      "amount": 10000,
      "currency": "USD",
      "metadata": { "order_id": "<uuid>" },
      "charged_at": { "seconds": 1789553409, "nanos": 732172724 }
    },
    "created_at": { "seconds": 1789553409, "nanos": 940514221 }
  }
}
```

Both `/api/payments/callback` and `/api/payments/webhook` automatically unwrap `payload.root` before reading fields, so they accept both the new envelope and the legacy flat shape (`{ type: "payment.succeeded", data: {...} }`).

The `amount` is in **cents** (smallest currency unit). For a $100.00 USD payment the gateway sends `amount: 10000`.

## How the Webhook Works

1. Customer pays on the gateway (Stripe/PayPal/SafePay)
2. Gateway sends a POST to your webhook URL
3. Our code verifies the signature (for security)
4. The invoice is marked as Paid in the database
5. Customer is redirected back to the public invoice page
6. The page shows "Payment Successful" banner
7. A receipt email is sent (if SMTP is configured)

## Troubleshooting: webhook marked UNDELIVERED

If a webhook shows `UNDELIVERED` after 5 attempts in the SafePay dashboard, the gateway gave up because every retry returned a non-2xx status. Common causes:

| Endpoint response | Cause |
|---|---|
| `400 {"error":"order_id not found"}` | The endpoint didn't find `order_id` in the payload. Fixed as of the `root`-unwrapper release. **Replay the payload once the fix is deployed.** |
| `400 {"error":"Invoice <id> not found"}` | The order_id is real but no matching invoice exists in our DB. Check that the invoice hasn't been deleted. |
| `401 {"error":"Missing signature"}` | Hit `/api/payments/webhook` (Stripe/PayPal-style endpoint) from SafePay. Use `/api/payments/callback` instead — SafePay doesn't send signatures. |
| `200 {"received":true,"skipped":"unknown gateway"}` | Gateway was misdetected. Also fixed (the `root` envelope is unwrapped before sniffing the body). |

### Replay script

To recover a stuck payment without waiting for SafePay to retry, use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\replay_safepay_webhook.ps1 `
    -OrderId "62120d6b-6f31-4a3c-894d-3a810c85e650" `
    -Tracker "track_c0b85118-2e45-4054-bcc1-226b4b5d73e8" `
    -AmountCents 10000 `
    -Email "arslanyasin112233@gmail.com"
```

The script:
1. Reads `.env.local` and inspects the `invoices` and `payment_transactions` rows for that order.
2. Builds the same v2.0.0 envelope shape SafePay would have sent.
3. POSTs it to `https://crm.diginest.pro/api/payments/callback`.
4. Prints the response (HTTP 200 + `{ success: true, status: "Paid" }` means it worked).

Add `-DryRun` to skip the POST and just see the DB state. Use `-PayloadPath <file.json>` to replay an exact payload you saved earlier.

## Testing Webhooks Locally

For local development, use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

For SafePay, you can POST a sample payload directly:
```bash
curl -X POST http://localhost:3000/api/payments/callback \
  -H "Content-Type: application/json" \
  -d '{"root":{"type":"payment.succeeded","data":{"tracker":"track_test","amount":10000,"metadata":{"order_id":"<your-invoice-id>"}}}}'
```

## Security Notes

- Stripe and PayPal webhooks require a valid signature. SafePay uses the `redirect_url` and `tracker` instead of a signature.
- Rate limited to 30 requests/minute per IP (`/api/payments/webhook`) and 10/min (`/api/payments/test-connection`).
- Webhook endpoints skip the auth middleware (see `middleware.ts`).
- All payment events are logged in the `activity_log` table.