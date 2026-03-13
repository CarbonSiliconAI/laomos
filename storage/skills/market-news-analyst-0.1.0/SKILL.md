---
name: market-news-analyst
description: This skill should be used when analyzing recent market-moving news events and their impact on equity markets and commodities. Use this skill when the user requests analysis of major financial news from the past 10 days, wants to understand market reactions to monetary policy decisions (FOMC, ECB, BOJ), needs assessment of geopolitical events' impact on commodities, or requires comprehensive review of earnings announcements from mega-cap stocks. The skill produces impact-ranked analysis reports based on structured news search frameworks. All analysis thinking and output are conducted in English.
---

# Market News Analyst

## Overview

This skill enables comprehensive analysis of market-moving news events from the past 10 days, focusing on their impact on US equity markets and commodities. The skill establishes systematic search strategies across trusted financial sources, evaluates market impact magnitude, analyzes actual market reactions, and produces structured English reports ranked by market impact significance.

## When to Use This Skill

Use this skill when:
- User requests analysis of recent major market news (past 10 days)
- User wants to understand market reactions to specific events (FOMC decisions, earnings, geopolitical)
- User needs comprehensive market news summary with impact assessment
- User asks about correlations between news events and commodity price movements
- User requests analysis of how central bank policy announcements affected markets

Example user requests:
- "Analyze the major market news from the past 10 days"
- "How did the latest FOMC decision impact the market?"
- "What were the most important market-moving events this week?"
- "Analyze recent geopolitical news and commodity price reactions"
- "Review mega-cap tech earnings and their market impact"

## Critical Implementation Notes

**EXECUTION STRATEGY:**

This skill requires structured news analysis using knowledge-based patterns and explicit documentation of search strategies. The proper approach is:

1. **Environment Assessment First:** 
   - Execute bash date command to confirm current date/time (lightweight, always works)
   - Calculate analysis period (today minus 10 days)
   - Document the specific date range for the report

2. **Document Search Strategy (NOT Execute It):**
   - Clearly state what news sources WOULD be queried
   - Provide the structured search framework organized by priority tier
   - Specify search query categories and keywords
   - List trusted financial news sources in priority order
   - DO NOT attempt curl commands to external sites
   - DO NOT create shell scripts that simulate news gathering
   - DO NOT execute loops of search commands

3. **Knowledge-Based Analysis:**
   - Reference patterns for market-moving events in the identified categories
   - Analyze expected market reactions based on event types
   - Generate impact assessment framework
   - Provide analysis structure with clear data organization

4. **Report Generation:**
   - Create structured markdown report with defined sections
   - Use templates for consistency
   - Include methodology documentation
   - Provide actionable guidance for data integration

## Analysis Workflow

Follow this structured workflow when analyzing market news:

### Step 1: News Collection via WebSearch/WebFetch

**Objective:** Gather comprehensive news from the past 10 days covering major market-moving events.

**Search Strategy:**

Execute parallel WebSearch queries covering different news categories:

**Monetary Policy:**
- Search: "FOMC meeting past 10 days", "Federal Reserve interest rate decision", "ECB policy decision recent", "Bank of Japan rate decision"
- Target: Central bank decisions, forward guidance changes, inflation commentary
- Fallback: Use official central bank websites via WebFetch if WebSearch results insufficient

**Inflation/Economic Data:**
- Search: "CPI inflation report latest", "jobs report NFP latest", "GDP data latest release", "PPI producer prices latest"
- Target: Major economic data releases and surprises
- Fallback: BLS.gov, Census.gov for official government data

**Mega-Cap Earnings:**
- Search: "Apple earnings latest quarter results", "Microsoft earnings latest quarter", "NVIDIA earnings latest quarter", "Amazon earnings latest quarter", "Tesla earnings latest quarter", "Meta earnings latest quarter", "Google Alphabet earnings latest quarter"
- Target: Results, guidance, market reactions for largest companies
- Fallback: SEC.gov EDGAR filings for official earnings reports

**Geopolitical Events:**
- Search: "Middle East conflict oil prices impact", "Ukraine Russia war latest", "US China trade tensions", "trade war tariffs latest"
- Target: Conflicts, sanctions, trade disputes affecting markets
- Fallback: Reuters, AP News for geopolitical coverage

**Commodity Markets:**
- Search: "oil prices news latest week", "gold prices latest", "OPEC meeting decision", "natural gas prices latest", "copper prices latest"
- Target: Supply disruptions, demand shifts, price movements
- Fallback: Platts, S&P Global for commodity data

**Corporate News:**
- Search: "major M&A announcement latest", "bank earnings latest quarter", "tech sector news latest", "bankruptcy filing latest", "credit rating downgrade latest"
- Target: Large corporate events beyond mega-caps
- Fallback: SEC.gov for official corporate filings

**Recommended News Sources (Priority Order):**
1. Official sources: FederalReserve.gov, SEC.gov (EDGAR), Treasury.gov, BLS.gov
2. Tier 1 financial news: Bloomberg, Reuters, Wall Street Journal, Financial Times
3. Specialized: CNBC (real-time), MarketWatch (summaries), S&P Global Platts (commodities)

**Search Execution Guidelines:**
- Use WebSearch for broad topic searches with --connect-timeout 10 to prevent hanging
-
