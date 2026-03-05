---
name: linkedin-cli
description: A bird-like LinkedIn CLI for searching profiles, checking messages, and summarizing your feed using session cookies.
homepage: https://github.com/clawdbot/linkedin-cli
metadata: {"clawdbot":{"emoji":"💼","requires":{"bins":["python3"],"env":["LINKEDIN_LI_AT","LINKEDIN_JSESSIONID"]}}}
---

# LinkedIn CLI (lk)

A witty, punchy LinkedIn CLI inspired by the `bird` CLI. It uses session cookies for authentication, allowing for automated profile scouting, feed summaries, and message checks without a browser.

## Setup

1.  **Extract Cookies**: Open LinkedIn in Chrome/Firefox.
2.  Go to **DevTools (F12)** -> **Application** -> **Cookies** -> `www.linkedin.com`.
3.  Copy the values for `li_at` and `JSESSIONID`.
4.  Set them in your environment:
    ```bash
    export LINKEDIN_LI_AT="your_li_at_value"
    export LINKEDIN_JSESSIONID="your_jsessionid_value"
    ```

## Usage

Display your current profile details:
```bash
lk whoami
```

Search for people by keywords:
```bash
lk search "query"
```

Get a detailed summary of a specific profile:
```bash
lk profile <public_id>
```

Summarize the top N posts from your timeline:
```bash
lk feed -n 10
```

Send a private message to a user by name:
```bash
lk send "Recipient Name" "The message text to send"
```

Quick peek at your recent conversations:
```bash
lk messages
```

Combined whoami and messages check:
```bash
lk check
```

## Dependencies

Requires the `linkedin-api` Python package:
```bash
pip install linkedin-api
```

## Authors
- Built by Fido 🐶
