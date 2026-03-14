# Send Private LinkedIn Message

## Purpose
Send a direct, private message (DM) to an existing connection natively via the CLI, using the exact recipient's name or known alias.

## Action Execution
```bash
lk send "Recipient Exact Name" "Your detailed message content here"
```
*(Dynamically inject both parameters with strict quoting. The Recipient must closely match someone you can currently message).*

## Success Verification
Message is successfully sent to the specific target. The CLI must output a success confirmation or status block indicating the payload delivery, without raising a `User not found` or `Messaging blocked` error.
