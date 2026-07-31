---
name: ta-team-analysis
description: This skill should be used when the user asks to "run trading analysis", "analyze stock with team", "team trading analysis", "run TLRY analysis", "stock analysis team", "trading team report", "multi-agent stock analysis", "run team analysis for [TICKER]", "종목 분석 팀 실행", or wants a multi-agent trading analysis driven by Claude Code subagents with automatic report saving.
version: 0.2.0
---

# TradingAgents Team Analysis Orchestration

Run a Claude Code subagent team that produces a multi-perspective trading analysis
and saves every report to disk.

## Choose the right tool first

This skill uses **Claude Code subagents with web search**. It does not run the
Python pipeline. Pick deliberately:

| Want | Use |
|---|---|
| The framework's real 12-agent LangGraph pipeline, structured output, memory log, saved report tree | `tradingagents analyze`, or `ta-eval-backtest` / `run_single_eval.py` |
| A live web-research analysis right now, no API key or install needed | **this skill** |
| To compare the two | run both and diff the final signals |

The Python pipeline is the product; this skill is a research harness that mirrors its
*shape* (analysts → debate → risk → decision) using web search instead of vendor APIs.
Its output is **not** interchangeable with pipeline output: no structured schemas, no
5-tier `parse_rating` contract, no memory log entry.

## Prerequisites

- Subagent spawning available (the `Agent` tool).
- `WebSearch` / `WebFetch` available to subagents.
- No environment variable is required. Older versions of this skill asked for
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and used `TeamCreate` / `TeamDelete`;
  **those tools no longer exist** — the session has a single implicit team, and
  `Agent`'s `team_name` parameter is deprecated and ignored. Do not call them.

## Input Variables

Collect from the user before starting (ask if missing):

| Variable | Description | Example |
|----------|-------------|---------|
| `{TICKER}` | Ticker symbol | `TLRY` |
| `{PRICE}` | Current approximate price | `~$7.99` |
| `{DATE}` | Analysis date (YYYY-MM-DD) | `2026-07-31` |

Derive: `{OUTPUT_DIR}` = `output/{TICKER}/{DATE}`

Default `{DATE}` to today and confirm. If `{PRICE}` is unknown, say so in the
prompts rather than inventing one — a fabricated anchor price corrupts every
support/resistance and risk/reward figure downstream.

## Output Directory Structure

```
output/{TICKER}/{DATE}/
├── 01-technical-analysis.md       ← ta-market-analyst
├── 02-fundamentals-analysis.md    ← ta-fundamentals-analyst
├── 03-news-sentiment-analysis.md  ← ta-news-sentiment-analyst
├── 04-risk-trade-decision.md      ← ta-risk-trader
└── 05-final-report.md             ← you (orchestrator)
```

## Team Structure

```
you = orchestrator (ta-lead, or the main conversation)
├── ta-market-analyst           technical: price trends, volume, indicators, patterns
├── ta-fundamentals-analyst     financials, valuation, competitive position
├── ta-news-sentiment-analyst   recent news, analyst ratings, social sentiment
└── ta-risk-trader              bull/bear debate + risk assessment + final signal
```

**These four are defined as agents in `.claude/agents/`.** Spawn them by
`subagent_type` — each already carries its own role, analysis requirements, evidence
discipline, report format, and output protocol:

```
Agent(subagent_type: "ta-market-analyst", name: "ta-market-analyst", ...)
```

The agent definition is the single source of truth for **how** each one works. This
skill owns only the orchestration and the **per-run variables** you pass in. Do not
restate an agent's instructions in its spawn prompt — two copies of the same prompt
drift apart, and the agent file wins.

## Execution Workflow

### Step 1 — Create the output directory

```
Bash: mkdir -p output/{TICKER}/{DATE}
```

### Step 2 — Create tasks

`TaskCreate` five tasks:

| # | Subject | Description |
|---|---------|-------------|
| 1 | Technical analysis for {TICKER} | Price trends, indicators, chart patterns |
| 2 | Fundamentals analysis for {TICKER} | Financials, valuation, competitive position |
| 3 | News/sentiment analysis for {TICKER} | Recent news, analyst ratings, social sentiment |
| 4 | Risk assessment & trading decision for {TICKER} | Bull/bear debate, risk evaluation, signal |
| 5 | Final synthesis report for {TICKER} | Combine all four into a final recommendation |

Then wire dependencies with `TaskUpdate`:
- task 4: `addBlockedBy: ["1", "2", "3"]`
- task 5: `addBlockedBy: ["1", "2", "3", "4"]`

Assign each with `TaskUpdate` `owner` matching the agent name you will spawn.

### Step 3 — Spawn the three analysts in parallel

Spawn `ta-market-analyst`, `ta-fundamentals-analyst`, and `ta-news-sentiment-analyst`
in a **single message with three `Agent` calls** so they run concurrently:

```
Agent(
  name: "ta-market-analyst",
  subagent_type: "ta-market-analyst",
  description: "Technical analysis for {TICKER}",
  prompt: <dispatch variables — see below>,
  run_in_background: true,     # default; you are notified on completion
)
```

Do not pass `team_name` — it is ignored.

#### Dispatch variables (the whole spawn prompt)

Each agent already knows its job. Pass only the run-specific values:

```
TICKER: {TICKER}
PRICE: {PRICE}                     # or "unknown" — do not invent one
DATE: {DATE}
OUTPUT_DIR: {OUTPUT_DIR}
TASK_ID: <the task you assigned this agent>
REPORT_TO: ta-lead                 # or "main" if the main conversation is orchestrating
```

Add extra context only when the user gave some (a thesis to test, a specific catalyst,
a time horizon). Never re-specify the analysis requirements or the output protocol —
they live in `.claude/agents/ta-*.md`.

If `{PRICE}` is unknown, pass the literal `unknown`. The agents are instructed to treat
it as unanchored rather than inventing a number.

### Step 4 — Spawn ta-risk-trader after 1–3 complete

Wait for all three completion notifications, **verify the three files exist and are
non-empty**, then spawn `ta-risk-trader` with the same dispatch variables. It reads the
three files from disk and is instructed to refuse and report back if any is missing, so
spawning it early wastes a run rather than producing a bad one.

### Step 5 — Receive results and synthesize

As each agent completes:
1. `Glob` / `Read` to confirm its report file exists and has content.
2. `TaskUpdate` its task to `completed` (agents are told to do this themselves;
   verify rather than assume).

After all four reports exist:
1. Read all four files.
2. Write `05-final-report.md`.
3. `TaskUpdate` task 5 to `completed`.

### Step 6 — Report to the user

Summarize the final signal and the four agents' conclusions in your reply, and give
the path to `05-final-report.md`. **Do not** send `shutdown_request` to the agents
and do not call `TeamDelete` — background subagents finish on their own, and
originating a shutdown request is reserved for when the user asks for it.

## Agent Prompt Templates

**There are none here by design.** Each agent's role, analysis requirements, evidence
discipline, report format, and output protocol live in its own definition:

| Agent | Definition | Writes |
|---|---|---|
| `ta-market-analyst` | `.claude/agents/ta-market-analyst.md` | `01-technical-analysis.md` |
| `ta-fundamentals-analyst` | `.claude/agents/ta-fundamentals-analyst.md` | `02-fundamentals-analysis.md` |
| `ta-news-sentiment-analyst` | `.claude/agents/ta-news-sentiment-analyst.md` | `03-news-sentiment-analysis.md` |
| `ta-risk-trader` | `.claude/agents/ta-risk-trader.md` | `04-risk-trade-decision.md` |

Read the agent file if you need to know what one will produce. Editing an agent's
behavior means editing that file, not this skill.

Each agent is instructed to, in order: `Write` its report to the path above,
`TaskUpdate` its task to `completed`, then `SendMessage` the full report text to
`REPORT_TO`. Each also ends its report with a fixed verdict line
(`## Technical Direction:`, `## Fundamental Rating:`, `## Sentiment Direction:`,
`## FINAL SIGNAL:`) plus a **Data Gaps** section — that is what you key the synthesis
table off.

## Orchestrator Synthesis Protocol

### 1. Verify files
```
Glob: output/{TICKER}/{DATE}/0*.md
```
Confirm `01` through `04` exist and are non-empty.

### 2. Read all four reports

### 3. Write `05-final-report.md`

```markdown
# {TICKER} Comprehensive Trading Report

**Date**: {DATE} | **Price**: {PRICE} | **Agents**: 4 (ta-market-analyst, ta-fundamentals-analyst, ta-news-sentiment-analyst, ta-risk-trader)

---

## FINAL SIGNAL: **[BUY/SELL/HOLD]** (from ta-risk-trader)

| Item | Value |
|------|-------|
| Entry Price | ... |
| Target Price | ... |
| Stop Loss | ... |
| Risk/Reward | ... |
| Position Sizing | ... |
| Timeframe | ... |
| Confidence | ... |

---

## Agent Conclusions

| Agent | Role | Conclusion |
|-------|------|-----------|
| ta-market-analyst | Technical | [direction] |
| ta-fundamentals-analyst | Fundamental | [rating] |
| ta-news-sentiment-analyst | News/Sentiment | [direction] |
| ta-risk-trader | Risk & Decision | [signal + confidence] |

---

## 1. Technical Analysis
[summary of 01 — key indicators, support/resistance, direction]

## 2. Fundamentals Analysis
[summary of 02 — financials, valuation, rating]

## 3. News/Sentiment Analysis
[summary of 03 — key news, analyst views, sentiment]

## 4. Risk Assessment & Trading Decision
[summary of 04 — bull/bear cases, risks, trading plan]

## 5. Final Synthesis
[your own synthesis across all four perspectives]

### Key Takeaway
[1-2 sentences]

### Data Gaps
[anything the agents reported as unavailable, and how it limits confidence]

### Critical Monitoring Points
[numbered list of events/levels to watch]

---

## Sources
[combined sources from all reports]

---

> **Disclaimer**: This is AI-agent research based on public web sources, not
> investment advice. It was not produced by the TradingAgents Python pipeline and
> carries no backtest or realized-return validation. All investment decisions are
> your own responsibility.
```

Keep the **Data Gaps** section even when empty — write "none". Silently dropping it
makes a thin analysis look complete.

### 4. Save
```
Write: output/{TICKER}/{DATE}/05-final-report.md
```

## Validation Checklist

- [ ] `output/{TICKER}/{DATE}/` exists
- [ ] `01-technical-analysis.md` exists, non-empty, ends with a Technical Direction line
- [ ] `02-fundamentals-analysis.md` exists, non-empty, ends with a Fundamental Rating line
- [ ] `03-news-sentiment-analysis.md` exists, non-empty, ends with a Sentiment Direction line
- [ ] `04-risk-trade-decision.md` exists, non-empty, ends with a FINAL SIGNAL line
- [ ] `05-final-report.md` exists with the full synthesis
- [ ] Final report carries FINAL SIGNAL plus entry/target/stop
- [ ] Data Gaps section present (even if "none")
- [ ] All 5 tasks marked completed

## Troubleshooting

**Agent sent a report but did not save the file** — extract the content from its
message, `Write` it to the correct path yourself, then continue.

**Agent went idle without completing** — `SendMessage` to it by name (a send resumes
it from its transcript) reminding it of the Output Protocol. If it still does not
respond, write the report from the material it did send and note the gap in the final
report.

**ta-risk-trader reports missing inputs** — it was spawned before 1–3 finished. Verify
the three files, then re-spawn it.

**A `TeamCreate` / `TeamDelete` / `shutdown_request` step from an older runbook
fails** — expected. Those tools are gone; skip the step. Task assignment is via
`TaskUpdate`'s `owner`, and background agents need no shutdown.
