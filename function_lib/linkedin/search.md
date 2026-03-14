# Search LinkedIn Profiles

## Purpose
Search the LinkedIn network for people, recruiters, or candidates matching a specific query keyword or phrase.

## Action Execution
```bash
lk search "${QUERY}"
```
*(Note: Ensure the TaskChain context replaces `${QUERY}` with the actual search string inside the bash block prior to execution).*

## Success Verification
The search completes successfully and prints a list of valid candidate profiles (including public IDs, names, and headlines). It must not return blank output if candidates exist.
