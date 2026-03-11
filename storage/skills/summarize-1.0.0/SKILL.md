---
name: summarize
description: Summarize URLs or files with the summarize CLI (web, PDFs, images, audio, YouTube). Requires explicit content input - cannot generate summaries without provided sources.
homepage: https://summarize.sh
metadata: {"clawdbot":{"emoji":"🧾","requires":{"bins":["summarize"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/summarize","bins":["summarize"],"label":"Install summarize (brew)"}]}}
---

# Summarize

Fast CLI to summarize URLs, local files, and YouTube links.

## Quick start

summarize "https://example.com" --model google/gemini-3-flash-preview --connect-timeout 10
summarize "/path/to/file.pdf" --model google/gemini-3-flash-preview
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto

## Critical Input Requirements

**IMPORTANT**: The summarize skill REQUIRES one of the following explicit inputs:
- **URL**: A complete web link (http/https) - must be provided by user or retrieved from previous action
- **File path**: Local file path (PDF, text, image, audio) - must exist and be accessible
- **YouTube link**: Direct video URL - must be a valid youtube.com or youtu.be link
- **Text content**: Raw article text pasted directly

**DO NOT** ask to summarize "the following article" or "the text below" without receiving actual content first.

**WORKFLOW REQUIREMENT**: If this skill is part of a multi-step chain:
1. Previous action MUST explicitly retrieve or provide content (URLs, file paths, or text)
2. Pass the retrieved content explicitly to this summarize action
3. Verify content was obtained in prior steps before attempting summarization
4. Use explicit variable passing or output redirection from previous actions

**If content is not available**, respond with:
- Clear request for specific URLs, file paths, or text
- Example format of what you need
- Instructions for user to provide the missing content
- DO NOT proceed to summarization without verified content

## Model + keys

Set the API key for your chosen provider:
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- xAI: `XAI_API_KEY`
- Google: `GEMINI_API_KEY` (aliases: `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`)

Default model is `google/gemini-3-flash-preview` if none is set.

## Useful flags

- `--length short|medium|long|xl|xxl|<chars>` — Control summary length
- `--max-output-tokens <count>` — Limit token usage
- `--connect-timeout 10` — Set connection timeout to 10 seconds (recommended for reliability)
- `--extract-only` — Extract content without summarizing (URLs only)
- `--json` — Output machine-readable format
- `--firecrawl auto` — Enable fallback extraction for blocked sites (REQUIRED for many news sites)
- `--youtube auto` — Use Apify fallback for YouTube (requires `APIFY_API_TOKEN`)
- `--retry 3` — Retry failed requests up to 3 times

## Reliable API endpoints and best practices

For best results with different content types:
- **Web URLs**: Always use `--firecrawl auto` for news sites and protected content
- **YouTube**: Use `--youtube auto` with valid APIFY_API_TOKEN
- **PDFs**: Provide full local file path, ensure file is readable with `ls -la /path/to/file`
- **Text files**: Use local path or pipe content directly
- **News articles**: Use `--connect-timeout 10 --firecrawl auto --retry 3` for maximum reliability

## Multi-step workflow pattern

When summarize is part of a chain requiring news/content retrieval:

**STEP 1: Retrieve content sources**
# Example: Search and collect URLs
curl -s "https://news.source.com/api/latest" | jq -r '.articles[].url' > /tmp/news_urls.txt

**STEP 2: Verify content was retrieved**
```bash
# Verify file
