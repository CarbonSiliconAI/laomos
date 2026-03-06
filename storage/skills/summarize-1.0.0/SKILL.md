---
name: summarize
description: Summarize URLs or files with the summarize CLI (web, PDFs, images, audio, YouTube).
homepage: https://summarize.sh
metadata: {"clawdbot":{"emoji":"🧾","requires":{"bins":["summarize"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/summarize","bins":["summarize"],"label":"Install summarize (brew)"}]}}
---

# Summarize

Fast CLI to summarize URLs, local files, and YouTube links.

## Quick start

summarize "https://example.com" --model google/gemini-3-flash-preview
summarize "/path/to/file.pdf" --model google/gemini-3-flash-preview
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto

## Input requirements

The summarize skill requires one of the following:
- **URL**: A web link (http/https)
- **File path**: Local file (PDF, text, image, audio)
- **YouTube link**: Direct video URL
- **Text content**: Pasted article text

If you ask to summarize "the following article" or "the text below" without providing the content, ask the user to paste the article text directly.

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
- `--extract-only` — Extract content without summarizing (URLs only)
- `--json` — Output machine-readable format
- `--firecrawl auto|off|always` — Enable fallback extraction for blocked sites
- `--youtube auto` — Use Apify fallback for YouTube (requires `APIFY_API_TOKEN`)

## Config

Optional config file: `~/.summarize/config.json`

```json
{ "model": "openai/gpt-5.2" }
```

Optional services:
- `FIRECRAWL_API_KEY` — For extracting content from blocked/protected sites
- `APIFY_API_TOKEN` — For YouTube extraction fallback
