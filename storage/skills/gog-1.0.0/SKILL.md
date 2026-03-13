---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
homepage: https://gogcli.sh
metadata: {"clawdbot":{"emoji":"🎮","requires":{"bins":["gog"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/gogcli","bins":["gog"],"label":"Install gog (brew)"}]}}
---

# gog

Use `gog` for Gmail/Calendar/Drive/Contacts/Sheets/Docs. Requires OAuth setup and installation.

## Installation

Before using gog, ensure it is installed:
brew tap steipete/tap
brew install gogcli

If Homebrew installation fails, try:
```bash
brew install --verbose steipete/tap/gogcli
```

Verify installation:
```bash
gog --version
```

## Setup (one-time, required before use)

1. **Configure OAuth credentials:**
   ```bash
   gog auth credentials /path/to/client_secret.json
   ```

2. **Add your Google account:**
   ```bash
   gog auth add you@gmail.com --services gmail,calendar,drive,contacts,sheets,docs --no-input
   ```

3. **Verify authentication:**
   ```bash
   gog auth list
   ```

4. **Set default account (optional, to avoid repeating --account flag):**
   ```bash
   export GOG_ACCOUNT=you@gmail.com
   ```

## Common Commands

### Gmail
- Search: `gog gmail search 'newer_than:7d' --max 10 --no-input`
- Send: `gog gmail send --to a@b.com --subject "Hi" --body "Hello" --confirm`
- Get message: `gog gmail get <messageId> --no-input`

### Calendar
- List events: `gog calendar events <calendarId> --from <iso-date> --to <iso-date> --no-input`
- Create event: `gog calendar create <calendarId> --title "Event" --start <iso-date> --end <iso-date> --confirm`

### Drive
- Search: `gog drive search "query" --max 10 --no-input`
- List files: `gog drive list --max 20 --no-input`

### Contacts
- List contacts: `gog contacts list --max 20 --no-input`
- Get contact: `gog contacts get <contactId> --no-input`

### Sheets
- Get range: `gog sheets get <sheetId> "Tab!A1:D10" --json --no-input`
- Update cells: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED --confirm`
- Append rows: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS --confirm`
- Clear range: `gog sheets clear <sheetId> "Tab!A2:Z" --confirm`
- Get metadata: `gog sheets metadata <sheetId> --json --no-input`

### Docs
- Export document: `gog docs export <docId> --format pdf --out /tmp/doc.pdf --no-input`
- Export as text: `gog docs export <docId> --format txt --out /tmp/doc.txt --no-input`
- Read document: `gog docs cat <docId> --no-input`
- Copy document: `gog docs copy <docId> --title "Copy of Doc" --confirm`

## Required Information for Docs Operations

To work with Google Docs, you must provide:
- **Document ID**: Found in the URL `docs.google.com/document/d/{docId}`
- **Gmail Account**: The email address configured with `gog auth add`
- **OAuth Credentials**: Properly configured via `gog auth credentials`

## Best Practices

- Always use `--no-input` flag for scripting to prevent interactive prompts
- Use `--json` for JSON output in scripts
- Use `--confirm` flag before
