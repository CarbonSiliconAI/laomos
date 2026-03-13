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
summarize "article text here" --model google/gemini-3-flash-preview

## Critical Input Requirements

The summarize skill requires one of the following:
- **URL**: A web link (http/https) - will attempt extraction with timeout
- **File path**: Local file (PDF, text, image, audio) - must exist and be readable
- **YouTube link**: Direct video URL (requires `--youtube auto` flag)
- **Text content**: Pasted article text directly in quotes

If you ask to summarize "the following article" or "the text below" without providing the content, ask the user to paste the article text directly in quotes.

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
- `--connect-timeout <seconds>` — Set connection timeout (default: 30, recommended: 10-15 for reliability)
- `--extract-only` — Extract content without summarizing (URLs only)
- `--json` — Output machine-readable format
- `--firecrawl auto` — Enable fallback extraction for blocked sites (REQUIRED for many news sites)
- `--youtube auto` — Use Apify fallback for YouTube (requires `APIFY_API_TOKEN`)
- `--no-input` — Run without interactive prompts

## Error handling

**If URL extraction fails:**
- Try with `--firecrawl auto` flag (requires `FIRECRAWL_API_KEY`)
- Fallback to `--extract-only` to verify content is accessible
- Check that the URL is publicly accessible (not behind login/paywall)

**If API calls timeout:**
- Increase `--connect-timeout` value (try 15-20 seconds)
- Verify API key is set correctly for chosen model
- Try a different model if primary is unavailable

**If file summarization fails:**
- Verify file path exists: `ls -la /path/to/file`
- Check file permissions: `stat /path/to/file`
- Ensure file format is supported (PDF, TXT, PNG, MP3, etc.)

**If YouTube extraction fails:**
- Use `--youtube auto` flag
- Verify `APIFY_API_TOKEN` is set if using fallback
- Try extracting with `--extract-only` first

## Config

Optional config file: `~/.summarize/config.json`

{
  "model": "google/gemini-3-flash-preview",
  "connect_timeout": 10,
  "firecrawl": "auto"
}

Optional services:
- `FIRECRAWL_API_KEY` — For extracting content from blocked/protected sites
- `APIFY_API_TOKEN` — For YouTube extraction fallback
