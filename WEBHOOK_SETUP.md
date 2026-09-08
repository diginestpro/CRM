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

In SafePay Merchant Dashboard → Webhooks:
- **URL**: `https://crm.diginest.pro/api/payments/webhook/safepay`
- **Events**:
  - `payment.completed`
  - `payment.failed`

## How the Webhook Works

1. Customer pays on the gateway (Stripe/PayPal/SafePay)
2. Gateway sends a POST to your webhook URL
3. Our code verifies the signature (for security)
4. The invoice is marked as Paid in the database
5. Customer is redirected back to the public invoice page
6. The page shows "Payment Successful" banner
7. A receipt email is sent (if SMTP is configured)

## Testing Webhooks Locally

For local development, use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

## Security Notes

- All webhooks require a valid signature
- Rate limited to 30 requests/minute per IP
- Unauthenticated requests are rejected
- All payment events are logged in the activity_log table
