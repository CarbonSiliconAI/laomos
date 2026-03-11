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

### Step 1: Environment Assessment and Date Confirmation

**Objective:** Establish current date/time context and confirm analysis period.

Execute bash command to confirm current date:

date "+%Y-%m-%d %H:%M:%S UTC"

**Define Analysis Period:**
- End Date: Today (confirmed via bash date command)
- Start Date: 10 days ago (calculated from end date)
- Document specific date range for report

**Output Format:**
Analysis period: [START_DATE] to [END_DATE]

### Step 2: Define Comprehensive News Search Strategy

**Objective:** Establish systematic search coverage across all major market-moving categories.

**IMPORTANT:** Document the search strategy that WOULD be executed. Do NOT attempt to execute curl commands, loops, or external API calls.

**Monetary Policy Searches (Priority 1):**
- "FOMC Federal Reserve decision [analysis period]"
- "ECB interest rate announcement [analysis period]"
- "Federal Reserve press conference latest"
- "Powell testimony latest"
- "Central bank rate decision latest"
- "Federal Reserve balance sheet QE QT latest"

**Economic Data Releases (Priority 1):**
- "CPI inflation report latest"
- "NFP non-farm payroll jobs report latest"
- "Unemployment rate latest"
- "GDP growth report latest"
- "PPI producer prices latest"
- "Retail sales latest"
- "Housing starts building permits latest"
- "Consumer confidence index latest"
- "Initial jobless claims
