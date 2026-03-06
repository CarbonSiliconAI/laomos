# Self-Debug: Payments Skill

## Common Failure Modes

### 1. **Webhook Verification Failures**
- Signature validation fails, rejecting legitimate webhooks
- Endpoint unreachable or timing out during webhook delivery
- Webhook handler crashes silently, leaving transactions unconfirmed
- Duplicate webhook processing causes double-charging or double-crediting
- Webhook retry logic missing, losing critical state transitions

### 2. **Provider Integration Breaks**
- API credentials expired, rotated, or misconfigured
- Provider API version changed; old endpoint calls return 404
- Rate limiting hit without backoff strategy
- Network timeouts during charge requests
- Provider-specific error codes not mapped to application states

### 3. **Checkout Flow Failures**
- Client-side success callback fires but webhook never arrives (payment actually failed)
- User redirected to success page before charge completes
- Session/cart state lost between checkout initiation and confirmation
- Idempotency key not sent; duplicate charges on retry
- Currency mismatch between frontend display and backend charge

### 4. **Subscription Lifecycle Breaks**
- Subscription created but cancellation webhook never processed
- Upgrade/downgrade logic applies immediately instead of at period end
- Trial period logic broken; customer charged during trial
- Renewal fails silently; no retry, no notification to customer
- `cancel_at_period_end` flag ignored; immediate cancellation instead

### 5. **Security & Compliance Violations**
- Card data logged, cached, or stored in application database
- CVV transmitted or stored anywhere
- PCI scope assessment incomplete; unnecessary compliance burden
- Fraud signals ignored; no velocity checks or 3D Secure fallback
- Chargeback handling missing; no documentation retention

### 6. **Data Consistency Issues**
- Prices stored as floats instead of cents; rounding errors accumulate
- Refund recorded in database but not actually processed with provider
- Invoice generated before payment confirmed
- Customer record updated before webhook confirms transaction
- Currency conversion applied client-side instead of server-side

### 7. **Environment & Configuration Errors**
- Test API keys used in production (or vice versa)
- Webhook endpoint URL not updated after deployment
- Provider sandbox/live credentials mixed
- Timezone assumptions break for international customers
- Locale/language settings cause pricing display mismatches

---

## Step-by-Step Debugging Checklist

### **Phase 1: Isolate the Failure**

- [ ] **Identify failure type:** Is it checkout, webhook, subscription, or security?
- [ ] **Check logs:** Search for error messages, stack traces, provider API responses
- [ ] **Reproduce locally:** Use test mode credentials and test cards
- [ ] **Check provider status:** Is the payment processor experiencing outages?
- [ ] **Verify credentials:** Are API keys/secrets correct and not expired?
- [ ] **Confirm environment:** Are you in test mode when debugging, production when live?

### **Phase 2: Webhook Diagnostics**

- [ ] **Endpoint reachability:** Can the provider reach your webhook URL? (Check firewall, DNS, HTTPS cert)
- [ ] **Signature verification:** Is the webhook signature validation logic correct?
  - Decode the signature using provider's public key
  - Verify timestamp is within acceptable window (prevent replay attacks)
  - Confirm payload hash matches signature
- [ ] **Webhook logs:** Are webhooks arriving? Check application and provider logs
- [ ] **Idempotency:** Is the webhook handler idempotent? (Safe to process twice)
  - Check if event ID already processed in database
  - Use database transaction to prevent race conditions
- [ ] **Error handling:** Does webhook handler catch and log exceptions?
- [ ] **Retry logic:** Are failed webhook handlers queued for retry?

### **Phase 3: Checkout Flow**

- [ ] **Client-side validation:** Is form validation preventing valid submissions?
- [ ] **Session state:** Is checkout session still valid? (Not expired, not cleared)
- [ ] **Idempotency key:** Is a unique key sent with every charge request?
- [ ] **Provider response:** What exact error did the provider return?
  - `declined` → Card declined; offer alternative payment method
  - `expired_card` → Card expired; ask for new card
  - `insufficient_funds` → Insufficient balance; ask user to try again
  - `rate_limit` → Provider rate limit hit;