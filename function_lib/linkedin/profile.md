# Get Comprehensive LinkedIn Profile

## Purpose
Retrieves and summarizes the detailed public/private profile data (experience, education, skills, headline, summary) of a specific LinkedIn user, identified by their precise profile ID slug (e.g., `william-g-gates`).

## Action Execution
```bash
lk profile "PUBLIC_PROFILE_ID"
```
*(Note: Replace "PUBLIC_PROFILE_ID" dynamically with the exact URL slug of the target user).*

## Success Verification
The script must successfully download and print the target's profile data block (JSON or rich text formatted) and should not throw a 'profile not found' or 'rate limit' exception.
