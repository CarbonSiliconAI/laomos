# Function: `python_test`
**Trigger Condition**: When executing tests to verify Python integration via the Bash terminal.

## Execution Pattern
When this function document is navigated to or utilized in a task chain, the agent must execute the following logic:

1. Request an integrated bash shell instance.
2. Provide the following inline script execution to the shell:
   ```bash
   python -c "print('hello world')"
   ```
3. Evaluate the terminal output. Success criteria are met if the stdout string explicitly reads: "hello world".

## Error Handling
If python throws an error, verify the python system binaries are accessible within the host VM environment and retry.
