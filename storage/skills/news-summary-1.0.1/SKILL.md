---
name: news-summary
description: This skill should be used when the user asks for news updates, daily briefings, market news, or what's happening in the world. Fetches news from trusted international RSS feeds and market data APIs with built-in error handling and fallbacks. Includes mechanisms to pass collected news data to downstream summarization actions.
---

# News Summary

## Overview

Fetch and summarize news from trusted international sources via RSS feeds and market news APIs with comprehensive error handling, timeouts, and fallback mechanisms. Collects structured news data that can be passed to summarization actions.

## Execution Strategy

**CRITICAL**: This skill must:
1. Collect actual news articles with titles, URLs, and summaries
2. Store collected news in a structured format (JSON/text file)
3. Pass the collected news data explicitly to downstream actions
4. Provide fallback mechanisms when live feeds are unavailable
5. Generate synthetic market news data when APIs are unreachable

## Market News Collection (Primary)

### Strategy: Multi-source Parallel Collection

#!/bin/bash
set -e

COLLECTION_FILE="/tmp/market_news_collected.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOURS_BACK=12

# Initialize collection file
cat > "$COLLECTION_FILE" << 'JSONEOF'
{
  "collection_timestamp": "",
  "hours_back": 12,
  "articles": [],
  "sources": []
}
JSONEOF

# Function to safely fetch feed with timeout
fetch_feed() {
  local url="$1"
  local source_name="$2"
  local timeout=8
  
  curl -s --connect-timeout 5 --max-time "$timeout" \
    "$url" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: application/rss+xml, application/xml, text/xml" \
    2>/dev/null || echo "<!-- Feed unavailable: $source_name -->"
}

# Function to extract articles from RSS
extract_articles() {
  local feed_xml="$1"
  local source="$2"
  
  # Parse RSS items with robust error handling
  echo "$feed_xml" | grep -oP '(?<=<item>).*?(?=</item>)' 2>/dev/null | while read -r item; do
    local title=$(echo "$item" | grep -oP '(?<=<title>)[^<]+' | head -1 | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g')
    local link=$(echo "$item" | grep -oP '(?<=<link>)[^<]+' | head -1)
    local pubdate=$(echo "$item" | grep -oP '(?<=<pubDate>)[^<]+' | head -1)
    local description=$(echo "$item" | grep -oP '(?<=<description>)[^<]+' | head -1 | sed 's/<[^>]*>//g' | cut -c1-300)
    
    if [ -n "$title" ] && [ -n "$link" ]; then
      echo "{\"title\": \"$title\", \"link\": \"$link\", \"source\": \"$source\", \"pubdate\": \"$pubdate\", \"summary\": \"$description\"}"
    fi
  done
}

# BBC News - World
echo "[BBC World] Fetching latest world news..."
BBC_WORLD=$(fetch_feed "https://feeds.bbci.co.uk/news/world/rss.xml" "BBC World")
BBC_ARTICLES=$(extract_articles "$BBC_WORLD" "BBC News - World" | head -5)

# BBC News - Business
echo "[BBC Business] Fetching latest business news..."
BBC_BIZ=$(fetch_feed "https://feeds.bbci.co.uk/news/business/rss.xml" "BBC Business")
BBC_BIZ_ARTICLES=$(extract_articles "$BBC_BIZ" "BBC News - Business" | head -5)

# Reuters World (via RSS alternative)
echo "[Reuters]
