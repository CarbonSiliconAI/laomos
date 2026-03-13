# LinkedIn CLI (lk) - Performance Analysis Criteria

## 1. Performance Metrics to Track

### Response Time Metrics
| Metric | Target | Acceptable Range | Critical Threshold |
|--------|--------|------------------|-------------------|
| `whoami` execution | < 2s | 1.5-3s | > 5s |
| `search` query | < 3s | 2-4s | > 8s |
| `profile` lookup | < 2.5s | 2-4s | > 6s |
| `feed` summarization (10 posts) | < 5s | 4-7s | > 12s |
| `messages` retrieval | < 3s | 2-4s | > 8s |
| `send` message delivery | < 2s | 1.5-3s | > 5s |
| `check` combined operation | < 6s | 5-8s | > 15s |

### Resource Utilization
- CPU usage during execution: < 30%
- Memory footprint: < 150MB
- Network bandwidth: < 5MB per operation
- Session cookie refresh rate: Monitor validity duration

### Reliability Metrics
- Session persistence: Cookies remain valid for > 24 hours
- Command success rate: ≥ 98%
- Error recovery rate: ≥ 95%
- Retry mechanism effectiveness: < 2 attempts average

---

## 2. Quality Criteria for Outputs

### Output Format Quality
| Command | Output Quality Criteria |
|---------|------------------------|
| `whoami` | Name, profile URL, headline, location all present; clean JSON or formatted text |
| `search` | Minimum 5 results returned; includes name, headline, profile URL, relevance score |
| `profile` | Complete profile data: name, headline, about, experience, education, connections count |
| `feed` | Post content, author name, engagement metrics (likes, comments), timestamp, readability |
| `messages` | Conversation list with: sender name, last message preview, timestamp, unread count |
| `send` | Confirmation message with: recipient name, message preview, delivery timestamp |
| `check` | Combined profile + recent messages in single coherent output |

### Data Accuracy
- Profile information matches LinkedIn's live data: 100% accuracy required
- Search results relevance: Top 3 results match query intent ≥ 90%
- Feed summaries: Preserve original meaning without distortion
- Message timestamps: Accurate to within ±1 minute
- Connection counts: Match LinkedIn's displayed count exactly

### Error Messaging
- Clear, actionable error messages for all failure states
- Error messages include: what failed, why, and suggested remediation
- No stack traces exposed to end users
- Timeout errors clearly indicate rate-limiting vs. connection issues

---

## 3. Success/Failure Indicators

### Success Indicators
✅ **Command executes without errors**
- Exit code 0 returned
- No exception stack traces in output
- Expected data structure returned

✅ **Data completeness**
- All required fields populated
- No null/empty values for critical fields
- Consistent field formatting across results

✅ **Session validity**
- Cookies authenticated successfully
- No "unauthorized" or "403 Forbidden" responses
- Session persists across multiple commands in sequence

✅ **User experience**
- Output is human-readable and scannable
- Response time meets target thresholds
- Consistent command behavior across platforms (Linux, macOS, Windows)

### Failure Indicators
❌ **Authentication failures**
- Exit code 401/403
- "Invalid credentials" or "Session expired" message
- Cookie validation fails at startup

❌ **Data quality failures**
- Missing critical fields (name, profile URL)
- Truncated or corrupted output
- Inconsistent data types (e.g., timestamp as string vs. integer)

❌ **Performance failures**
- Response time exceeds critical threshold
- Memory usage > 250MB
- Network timeouts > 2 per 10 commands

❌ **Reliability failures**
- Command fails intermittently (< 95% success rate)
- Session expires without warning
- Rate limiting triggers on normal usage patterns

---

## 4. Optimization Targets

### Speed Optimization
- **Caching Layer**: Implement 5-