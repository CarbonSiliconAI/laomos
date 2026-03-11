# LinkedIn CLI Self-Debug Guide

## Common Failure Modes

### Authentication Failures
- **Expired Cookies**: Session cookies (`li_at`, `JSESSIONID`) expire after inactivity or browser updates
- **Invalid Cookie Format**: Cookies copied incorrectly or with extra whitespace
- **Missing Environment Variables**: One or both required env vars not set
- **Cookie Domain Mismatch**: Cookies from different LinkedIn domains or regions
- **Rate Limiting**: Too many requests triggering LinkedIn's anti-bot detection

### Network & Connectivity Issues
- **Network Timeout**: LinkedIn API endpoint unreachable or slow
- **DNS Resolution Failure**: Cannot resolve linkedin.com
- **Proxy/Firewall Blocking**: Corporate network restrictions on LinkedIn API calls
- **SSL/TLS Certificate Issues**: Outdated certificates or MITM interference

### Dependency Issues
- **Missing Python3**: Not installed or not in PATH
- **Missing linkedin-api Package**: Not installed or installed in wrong Python environment
- **Version Incompatibility**: Outdated linkedin-api version incompatible with current LinkedIn API
- **Conflicting Dependencies**: Other packages interfering with linkedin-api

### Input Validation Failures
- **Malformed Queries**: Special characters breaking search syntax
- **Invalid Public IDs**: Non-existent or improperly formatted profile IDs
- **Empty Recipient Names**: Message send without valid recipient
- **Message Content Issues**: Oversized messages or forbidden characters

### API Response Issues
- **Unexpected Response Format**: LinkedIn API changed response structure
- **Profile Not Found**: Public ID doesn't exist or is private
- **Insufficient Permissions**: Account lacks access to certain features
- **Empty Feed/Messages**: No data to summarize or display

## Step-by-Step Debugging Checklist

### Phase 1: Environment Validation
- [ ] Verify Python3 is installed: `python3 --version`
- [ ] Confirm Python3 is in PATH: `which python3`
- [ ] Check linkedin-api installation: `python3 -c "import linkedin_api; print(linkedin_api.__version__)"`
- [ ] Verify both env vars are set: `echo $LINKEDIN_LI_AT $LINKEDIN_JSESSIONID`
- [ ] Confirm env vars are not empty: `test -n "$LINKEDIN_LI_AT" && echo "li_at set" || echo "li_at missing"`
- [ ] Confirm env vars are not empty: `test -n "$LINKEDIN_JSESSIONID" && echo "JSESSIONID set" || echo "JSESSIONID missing"`

### Phase 2: Cookie Validation
- [ ] Verify `li_at` length (typically 100+ characters): `echo ${#LINKEDIN_LI_AT}`
- [ ] Verify `JSESSIONID` length (typically 30+ characters): `echo ${#LINKEDIN_JSESSIONID}`
- [ ] Check for leading/trailing whitespace: `echo "$LINKEDIN_LI_AT" | od -c | head`
- [ ] Confirm cookies are from `www.linkedin.com` (not `linkedin.com` or subdomains)
- [ ] Verify cookies are not expired in browser (check DevTools expiration dates)
- [ ] Test cookie freshness: Extract new cookies and re-export

### Phase 3: Network Connectivity
- [ ] Test basic connectivity: `ping -c 1 linkedin.com`
- [ ] Test HTTPS connectivity: `curl -I https://www.linkedin.com`
- [ ] Check DNS resolution: `nslookup linkedin.com`
- [ ] Verify no proxy blocking: Check corporate firewall/proxy settings
- [ ] Test from different network if possible (home vs. office)

### Phase 4: Skill Execution Testing
- [ ] Run simplest command first: `lk whoami`
- [ ] Check exit code: `echo $?` (0 = success, non-zero = failure)
- [ ] Capture full error output: `lk whoami 2>&1`
- [ ] Try with verbose/debug flag if available: `lk --debug whoami`
- [ ] Test each command individually before combinations

### Phase 5: Input Validation
- [ ] For search: Use simple, common keywords first (avoid special chars)
- [ ] For profile: Verify public_id format (usually alphanumeric)
- [ ] For messages: Ensure recipient name