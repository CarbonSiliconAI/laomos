# Payments Skill - Analysis Criteria

## 1. Performance Metrics to Track

### Integration Completeness
- **Webhook verification implementation**: % of recommended verification steps included (signature validation, event type filtering, idempotency)
- **Provider selection accuracy**: Correct recommendation given context (B2C, B2B, SaaS, marketplace, high-risk)
- **Security coverage**: % of PCI/fraud best practices addressed in output
- **Checklist adherence**: % of pre-live checklist items covered in implementation guidance

### Output Quality
- **Code correctness**: Absence of security vulnerabilities (card storage, client-side trust, hardcoded prices)
- **Completeness**: All required integration steps present (not just happy path)
- **Error handling**: Explicit coverage of failure states (declined, expired, insufficient funds, network failures)
- **Documentation clarity**: Webhook structure, test mode usage, and flow diagrams when applicable

### Contextual Awareness
- **Situation detection accuracy**: Correct identification of payment scenario from user context
- **Reference appropriateness**: Correct document references suggested (`providers.md`, `integration.md`, `subscriptions.md`, `security.md`)
- **Assumption validation**: Explicit clarification of ambiguous requirements before proceeding

---

## 2. Quality Criteria for Outputs

### Security Criterion (Non-Negotiable)
- ❌ **FAIL**: Any suggestion to store card data, CVV, or raw payment tokens
- ❌ **FAIL**: Reliance on client-side payment confirmation without server-side webhook verification
- ❌ **FAIL**: Missing webhook signature validation or event replay protection
- ✅ **PASS**: Explicit prohibition of sensitive data storage + provider-hosted/tokenized approach

### Integration Criterion
- ❌ **FAIL**: Webhook handling without idempotency keys or retry logic
- ❌ **FAIL**: Subscription lifecycle incomplete (missing upgrade/downgrade/cancel flows)
- ❌ **FAIL**: No explicit currency handling (amounts in wrong units)
- ✅ **PASS**: Complete webhook flow + all lifecycle events + currency in smallest unit

### Provider Selection Criterion
- ❌ **FAIL**: Recommending Stripe for EU SaaS with VAT complexity
- ❌ **FAIL**: Suggesting simple hosted checkout for marketplace with splits
- ❌ **FAIL**: No justification for provider choice
- ✅ **PASS**: Recommendation matches use case with explicit reasoning

### Testing Criterion
- ❌ **FAIL**: No mention of test mode or test cards
- ❌ **FAIL**: Missing failure simulation (declined cards, expired tokens)
- ❌ **FAIL**: No webhook testing approach
- ✅ **PASS**: Explicit test mode usage + failure scenarios + webhook verification steps

### Documentation Criterion
- ❌ **FAIL**: Vague webhook event structure ("handle payment events")
- ❌ **FAIL**: Missing refund/dispute handling instructions
- ❌ **FAIL**: No receipt/invoice configuration guidance
- ✅ **PASS**: Concrete event payloads + refund flow + invoice setup + retry strategy

---

## 3. Success/Failure Indicators

### Success Indicators
- User can implement the guidance without returning with "how do I handle X?" questions
- All red flags from skill definition are explicitly addressed
- Code examples use correct error handling patterns
- Webhook flow includes retry logic, idempotency, and verification
- Provider recommendation matches stated constraints (geography, complexity, risk profile)
- Test plan covers happy path + all failure states
- Pre-live checklist items are all addressed

### Failure Indicators
- ❌ Security vulnerability present (card storage, client-side trust, hardcoded prices)
- ❌ Incomplete integration (missing webhook, refund, or subscription handling)
- ❌ Provider mismatch (Stripe for VAT-heavy EU SaaS, Gumroad for marketplace splits)
- ❌ No test strategy or test mode mentioned
- ❌ Vague webhook handling ("call your backend when payment succeeds")
- ❌ Missing error states (only happy path covered)
- ❌ Ambiguous requirements not clarified before implementation
- ❌ Pricing psychology ignored (no discussion of billing cadence defaults)

---

## 4.