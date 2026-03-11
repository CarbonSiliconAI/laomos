# Market News Analyst - Self-Debug Guide

## Overview

This document provides diagnostic procedures to identify and fix issues when the market-news-analyst skill fails during execution. Use this guide when the skill produces incomplete analysis, incorrect impact rankings, missing data, or fails to complete the 6-step workflow.

---

## Part 1: Common Failure Modes

### Category A: News Collection Failures

#### A1. WebSearch/WebFetch Returns No Results
**Symptoms:**
- Empty news collection despite executing search queries
- "No results found" messages from search tools
- Analysis report missing entire event categories

**Root Causes:**
- Search terms too narrow or using outdated terminology
- News sources temporarily unavailable or rate-limited
- Time window (10 days) expired for intended events
- Search tool configuration issues
- Geographic restrictions on news sources

**Detection:**
- Check if Step 1 (News Collection) completed with <5 significant events found
- Verify search queries executed (should see WebSearch/WebFetch tool calls)
- Compare event count against typical 10-day period (should find 15-25 significant events)

---

#### A2. Stale or Outdated News Collected
**Symptoms:**
- News items dated outside 10-day window
- Analysis includes events from previous weeks
- Report timestamp doesn't match analysis period
- Missing recent events from last 2-3 days

**Root Causes:**
- Date filtering not applied to search results
- WebFetch pulling cached/archived content
- Search queries not time-constrained
- News source publication dates not verified
- Automated date parsing errors

**Detection:**
- Scan collected news items for publication dates
- Verify all events fall within [Current Date - 10 days] to [Current Date]
- Check if major recent news (FOMC, earnings, geopolitical) is missing
- Review news source timestamps vs article content dates

---

#### A3. Unreliable or Low-Tier Sources Used
**Symptoms:**
- Report cites unverified rumors or social media
- Analysis includes stock tips from unvetted sources
- Contradictory information from different sources unchecked
- Missing official government/central bank sources
- Heavy reliance on opinion pieces vs hard news

**Root Causes:**
- Source credibility tier not checked against `trusted_news_sources.md`
- Automated search returning all results without filtering
- Official sources not prioritized
- Tier 3/4 sources used when Tier 1/2 available
- No cross-verification of facts

**Detection:**
- Review "Data Sources and Methodology" section of report
- Check if FederalReserve.gov, SEC.gov, BLS.gov used for official announcements
- Verify major claims cite Bloomberg, Reuters, WSJ, or FT
- Flag any sources not listed in `trusted_news_sources.md`
- Count Tier 1 vs Tier 2 vs Tier 3 source citations

---

#### A4. Missing Key Event Categories
**Symptoms:**
- No monetary policy news despite FOMC meeting in period
- Commodity section empty when geopolitical events occurred
- Mega-cap earnings not analyzed
- Economic data releases missing
- Sector-specific news gaps

**Root Causes:**
- Search strategy incomplete (didn't execute all 6 search category groups)
- Search terms too generic or specific
- Filtering excluded relevant events
- Knowledge base references not loaded for collected news types
- Parallel search execution failed partially

**Detection:**
- Verify all 6 search categories executed:
  - ☐ Monetary Policy
  - ☐ Inflation/Economic Data
  - ☐ Mega-Cap Earnings
  - ☐ Geopolitical Events
  - ☐ Commodity Markets
  - ☐ Corporate News
- Check event type distribution in report
- Compare against expected events for period
- Verify search queries actually executed (tool call logs)

---

### Category B: Impact Assessment Failures

#### B1. Incorrect Impact Scoring
**Symptoms:**
- Minor events ranked higher than major events
- Impact scores seem arbitrary or inconsistent
- Report ranking doesn't match described market reactions
- Similar events scored vastly differently
- Score calculations unexplained

**Root Causes:**
- Price impact magnitude not accurately measured
- Breadth multiplier not applied correctly
- Forward-looking modifier misapplied
- Comparison to historical patterns incomplete
- Asset