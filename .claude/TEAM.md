# TradingAgents Team

Agent definitions live in `.claude/agents/`; the knowledge they load lives in
`.claude/skills/`. **Skills hold the verified facts about the codebase; agents hold
role, scope, and protocol.** Each agent's first action is to load its skill, so the
facts have exactly one home.

## Roster

Spawn the lead and let it dispatch, or spawn a specialist directly when you already
know the owner.

```
ta-lead  ── team lead: decompose, dispatch, verify, synthesize
│
├── dev / maintenance
│   ├── ta-agent-smith        agents, prompts, schemas      → ta-agent-creator, ta-prompt-engineer
│   ├── ta-graph-engineer     LangGraph nodes & routing     → ta-workflow-editor
│   ├── ta-data-engineer      tools, vendors, dataflows     → ta-data-tools
│   ├── ta-llm-engineer       providers, models, kwargs     → ta-llm-config
│   ├── ta-memory-engineer    decision log, reflection      → ta-memory-manager
│   ├── ta-evaluator          runs, backtests, A/B          → ta-eval-backtest
│   └── ta-maintainer         upstream sync, drift, baseline→ upstream-sync
│
└── runtime stock research    (orchestrated by the ta-team-analysis skill)
    ├── ta-market-analyst           → output/{T}/{D}/01-technical-analysis.md
    ├── ta-fundamentals-analyst     → output/{T}/{D}/02-fundamentals-analysis.md
    ├── ta-news-sentiment-analyst   → output/{T}/{D}/03-news-sentiment-analysis.md
    └── ta-risk-trader              → output/{T}/{D}/04-risk-trade-decision.md
```

All 12 use `model: inherit` — they run on the session's model. Add `model:` or
`effort:` to a definition's frontmatter to pin a tier for a specific role.

## Two different things named "analysis"

Keep these apart; conflating them produces numbers that look comparable but are not.

| | Python pipeline | Runtime research team |
|---|---|---|
| Who | `ta-evaluator`, or `tradingagents analyze` | `ta-market-analyst` … `ta-risk-trader` |
| Engine | 12-agent LangGraph in `tradingagents/` | Claude Code subagents + web search |
| Data | yfinance / Alpha Vantage / FRED / Polymarket | live web pages |
| Signal | 5-tier `Buy/Overweight/Hold/Underweight/Sell`, parsed from `**Rating**:` | `BUY/SELL/HOLD` prose |
| Needs | provider API key, `pip install -e .` | neither |
| Artifacts | `~/.tradingagents/logs/…json`, report tree, memory log entry | `output/{TICKER}/{DATE}/*.md` |

## Usage

```
# lead-driven, multi-part work
Agent(subagent_type: "ta-lead", prompt: "Switch to Anthropic and re-verify the graph builds")

# straight to the owner
Agent(subagent_type: "ta-llm-engineer", prompt: "Add the Cerebras OpenAI-compatible provider")

# stock research
Skill(ta-team-analysis)     # then follow its orchestration
```

When dispatching a specialist yourself, give it: the task scope, the files it may
touch, what it must not touch, and `REPORT_TO: main`.

## Shared environment contract

Every agent definition repeats these three because they gate all verification:

- Use **`python3`** — there is no `python` shim on this machine.
- If `import tradingagents.graph.*` fails on `yfinance`, run `pip install -e ".[dev]"`
  first (a venv is fine).
- Test baseline: **576 passed, 2 skipped** (2026-07-31, commit `a33fd4c`). The skips are
  `test_bedrock_provider.py` (no `langchain_aws`) and `test_deepseek_reasoning.py`
  (no `DEEPSEEK_API_KEY`). `ruff check .` passes clean.

If the environment changes, update this file **and** the Environment/Validation section
of each affected agent.

## Cost boundaries

- `ta-evaluator` is the only agent that runs the paid pipeline. It must estimate calls
  and get approval before a sweep, and report actual cost.
- `ta-llm-engineer` and `ta-data-engineer` verify by tests, not live API calls.
- The four research agents consume web search, not LLM provider quota.

## Ownership rules that prevent collisions

- A tool must **exist and route** (`ta-data-engineer`) before it is **bound in a
  ToolNode** (`ta-graph-engineer`) before a **prompt names it** (`ta-agent-smith`).
  Out of order, the run fails at execution with "data unavailable".
- A new analyst is a 4-step sequence, not parallel work:
  `ta-data-engineer → ta-agent-smith → ta-graph-engineer → ta-evaluator`.
- The rating vocabulary spans `rating.py`, `schemas.py`, `signal_processing.py` — one
  owner (`ta-agent-smith`), never split.
- Work after an upstream merge starts with `ta-maintainer`'s drift check, because the
  skills document internals a merge can invalidate.
- No agent edits `.claude/skills/` during a feature task. Skill drift is **reported** to
  the user, not silently patched — a wrong skill misleads the whole team.

## Maintenance

`ta-maintainer` owns the post-merge drift check (baseline: 20 graph nodes, 11 routed
tools, 16 OpenAI-compatible providers, `TradingMemoryLog` present /
`FinancialSituationMemory` absent). If those move, the corresponding skill is stale and
the agents built on it will confidently give wrong answers.
