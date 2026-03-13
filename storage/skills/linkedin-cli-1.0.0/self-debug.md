# LinkedIn CLI Self-Debug Guide

## Common Failure Modes

### Authentication Failures
- **Expired session cookies**: `li_at` and `JSESSIONID` tokens expire after inactivity or LinkedIn password changes
- **Invalid cookie format**: Malformed or truncated cookie values
- **Missing environment variables**: One or both cookies not set in the environment
- **Cookie scope mismatch**: Cookies extracted from wrong domain or browser profile

### Network & API Failures
- **Rate limiting**: LinkedIn API throttling requests after multiple calls in short timeframe
- **Connection timeouts**: Network unavailability or LinkedIn service downtime
- **SSL/TLS errors**: Certificate validation failures or proxy interference
- **Malformed API responses**: LinkedIn API returning unexpected JSON structure

### Dependency Failures
- **Missing Python3**: Not installed or not in PATH
- **Missing linkedin-api package**: Package not installed or wrong version
- **Python version incompatibility**: Using Python 2 or unsupported Python 3 version
- **Conflicting dependencies**: Other packages interfering with linkedin-api

### Input Validation Failures
- **Invalid public_id format**: Profile ID doesn't match LinkedIn's format
- **Special characters in queries**: Unescaped quotes or shell metacharacters
- **Empty or null inputs**: Missing required arguments
- **Oversized inputs**: Feed limit exceeding API constraints

### Profile/Feed Parsing Failures
- **Changed LinkedIn HTML/API structure**: Profile layout updates breaking parsers
- **Missing profile fields**: Incomplete user profiles lacking expected data
- **Private profile access**: Attempting to access restricted profile information
- **Deleted or suspended accounts**: Target user no longer accessible

## Step-by-Step Debugging Checklist

### Phase 1: Environment Verification
- [ ] Verify Python3 is installed: `python3 --version`
- [ ] Confirm Python3 is in PATH: `which python3`
- [ ] Check linkedin-api installation: `pip list | grep linkedin-api`
- [ ] Verify linkedin-api version: `pip show linkedin-api`
- [ ] Confirm both cookies are set: `echo $LINKEDIN_LI_AT` and `echo $LINKEDIN_JSESSIONID`
- [ ] Verify cookie values are non-empty: `[ -n "$LINKEDIN_LI_AT" ] && echo "Set" || echo "Empty"`
- [ ] Check for special characters in cookie values that might need escaping
- [ ] Verify no trailing/leading whitespace in environment variables

### Phase 2: Cookie Validation
- [ ] Confirm cookies were extracted from `www.linkedin.com` (not `linkedin.com`)
- [ ] Verify `li_at` is approximately 500+ characters long
- [ ] Verify `JSESSIONID` is approximately 30-50 characters long
- [ ] Check cookie extraction timestamp (should be recent, within days)
- [ ] Attempt to access LinkedIn.com in browser to verify account still active
- [ ] Verify account hasn't been locked or requires 2FA re-verification
- [ ] Test with a fresh cookie extraction if cookies are >7 days old
- [ ] Confirm cookies match the currently logged-in LinkedIn account

### Phase 3: Dependency Installation
- [ ] Install/upgrade linkedin-api: `pip install --upgrade linkedin-api`
- [ ] Verify installation location: `pip show linkedin-api | grep Location`
- [ ] Check for permission errors: `pip install --user linkedin-api` if needed
- [ ] Verify no conflicting Python environments: `which python3` vs `which pip`
- [ ] Install missing transitive dependencies: `pip install requests beautifulsoup4`
- [ ] Test import in Python: `python3 -c "from linkedin_api import Linkedin; print('OK')"`

### Phase 4: Basic Connectivity Test
- [ ] Test basic command: `lk whoami`
- [ ] Check for network connectivity: `ping linkedin.com`
- [ ] Verify no proxy/firewall blocking LinkedIn: `curl -I https://www.linkedin.com`
- [ ] Test with verbose/debug mode if available: `lk --debug whoami`
- [ ] Check system time is correct: `date` (LinkedIn validates timestamps)
- [ ] Verify SSL certificates are up-to-date: `curl --cacert /etc/ssl/certs/ca-certificates.crt https://www.linkedin.com`

### Phase 5: Input