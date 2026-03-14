# Get Authenticated Profile Information

## Purpose
Retrieves and displays the currently authenticated LinkedIn user's profile details using local session cookies. Use this to verify connection status or extract the host's identity.

## Action Execution
```bash
lk whoami
```

## Success Verification
The script must print a valid profile block containing the user's name and details without throwing an authentication or 401/403 connection error.
