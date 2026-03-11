# LinkedIn CLI (lk) - Analysis Criteria Document

## 1. Performance Metrics to Track

### Response Time Metrics
- **Command Execution Time**: Measure end-to-end execution time for each command type
  - `whoami`: Target < 2 seconds
  - `search`: Target < 3 seconds per query
  - `profile`: Target < 2.5 seconds per profile lookup
  - `feed`: Target < 4 seconds for 10 posts, scales linearly with `-n` parameter
  - `send`: Target < 2 seconds for message dispatch
  - `messages`: Target < 3 seconds for conversation retrieval
  - `check`: Target < 5 seconds combined operation

### Resource Utilization
- Memory consumption per command execution
- API request count per operation (LinkedIn API calls)
- Network bandwidth usage
- CPU usage during feed summarization

### Reliability Metrics
- Session persistence success rate (cookie validity)
- Command success rate across 100 consecutive executions
- Error recovery time
- Timeout frequency and recovery behavior

## 2. Quality Criteria for Outputs

### Data Accuracy
- **Profile Information**: Verify returned fields match LinkedIn's current data
  - Name, headline, location accuracy
  - Connection count correctness
  - Experience/education completeness
- **Search Results**: Validate result relevance and ranking
  - Top result should match search intent
  - All returned profiles should contain search keywords
- **Feed Summaries**: Assess content relevance and completeness
  - Summaries should capture post intent accurately
  - No truncation of critical information
  - Timestamp accuracy

### Output Formatting
- Consistent JSON/text output structure across all commands
- Proper escaping of special characters in names and messages
- Readable date/time formatting (ISO 8601 standard)
- Proper handling of Unicode characters in international names

### Completeness
- All available profile fields populated when relevant
- Feed summaries include author, engagement metrics, and timestamps
- Message previews include sender, timestamp, and read status
- Search results include minimum required fields (name, headline, profile URL)

## 3. Success/Failure Indicators

### Success Indicators
- ✅ Command returns valid, parseable output (JSON/text)
- ✅ HTTP status codes indicate successful API calls (200, 201)
- ✅ Session cookies remain valid for entire command execution
- ✅ Output contains expected fields without null/empty critical values
- ✅ No authentication errors or 401 responses
- ✅ Graceful handling of pagination (feed, search with multiple pages)
- ✅ Message delivery confirmed (send command returns confirmation)

### Failure Indicators
- ❌ Command timeout (exceeds target response time by >50%)
- ❌ Missing or null values in critical output fields
- ❌ Authentication failures (401, 403 errors)
- ❌ Malformed JSON output
- ❌ Session cookie expiration mid-execution
- ❌ API rate limiting (429 errors) without retry logic
- ❌ Incomplete data retrieval (partial results without pagination)
- ❌ Unhandled exceptions or stack traces in output
- ❌ Message delivery failures without error notification
- ❌ Search returning unrelated profiles (relevance < 70%)

## 4. Optimization Targets

### Speed Optimization
- Implement response caching for profile lookups (30-minute TTL)
- Batch API requests where possible (multiple profile lookups)
- Parallel processing for feed summarization
- Connection pooling for HTTP requests
- Target: Reduce average command latency by 25%

### Reliability Optimization
- Implement automatic cookie refresh/renewal logic
- Add exponential backoff for rate-limited requests
- Implement retry logic for transient failures (3 attempts max)
- Add connection timeout handling (30-second limit)
- Target: Achieve 99% command success rate

### Output Quality Optimization
- Implement field validation before output
- Add data sanitization for special characters
- Implement consistent error messaging
- Add progress indicators for long-running operations (feed with large `-n`)
- Target: Zero malformed output responses

### Resource Optimization
- Implement streaming for large result sets
- Lazy-load profile details (fetch only requested fields)
- Implement memory-efficient feed processing
- Target: <50MB memory footprint for