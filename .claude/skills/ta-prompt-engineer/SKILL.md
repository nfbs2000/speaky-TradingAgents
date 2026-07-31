---
name: ta-prompt-engineer
description: This skill should be used when the user asks to "modify agent prompt", "improve prompt", "change system message", "tune agent behavior", "A/B test prompts", "edit market analyst prompt", "change news analyst instructions", "modify bull researcher tone", "adjust portfolio manager criteria", "update trader prompt", "change sentiment analyst prompt", or mentions prompt engineering for any of the 12 TradingAgents agents.
version: 0.2.0
---

# TradingAgents Prompt Engineering

Modify, improve, and A/B test prompts for the 12 LLM agents in the TradingAgents
multi-agent trading system.

## Agent Quick Reference

| Agent | File | LLM | Prompt Style | Structured Output |
|-------|------|-----|--------------|-------------------|
| Market Analyst | `agents/analysts/market_analyst.py` | quick | ChatPromptTemplate + `system_message` var | no (prose) |
| News Analyst | `agents/analysts/news_analyst.py` | quick | ChatPromptTemplate + `system_message` var | no (prose) |
| Fundamentals Analyst | `agents/analysts/fundamentals_analyst.py` | quick | ChatPromptTemplate + `system_message` var | no (prose) |
| Sentiment Analyst | `agents/analysts/sentiment_analyst.py` | quick | ChatPromptTemplate + `_build_system_message()` | **yes** — `SentimentReport` |
| Bull Researcher | `agents/researchers/bull_researcher.py` | quick | f-string prompt | no |
| Bear Researcher | `agents/researchers/bear_researcher.py` | quick | f-string prompt | no |
| Research Manager | `agents/managers/research_manager.py` | **deep** | f-string prompt | **yes** — `ResearchPlan` |
| Trader | `agents/trader/trader.py` | quick | `messages` list (system + user dicts) | **yes** — `TraderProposal` |
| Aggressive Debator | `agents/risk_mgmt/aggressive_debator.py` | quick | f-string prompt | no |
| Conservative Debator | `agents/risk_mgmt/conservative_debator.py` | quick | f-string prompt | no |
| Neutral Debator | `agents/risk_mgmt/neutral_debator.py` | quick | f-string prompt | no |
| Portfolio Manager | `agents/managers/portfolio_manager.py` | **deep** | f-string prompt | **yes** — `PortfolioDecision` |

Plus one non-node prompt owner:

| Reflector | `graph/reflection.py` | quick | `_get_log_reflection_prompt()` returns the system prompt | no |

All paths are relative to `tradingagents/`.

> **Naming note**: the risk judge is the **Portfolio Manager**, not "Risk Manager".
> The 4th analyst is the **Sentiment Analyst** (renamed from `social_media_analyst`
> in v0.2.5); `create_social_media_analyst` survives only as a deprecated alias
> that emits a `DeprecationWarning`. Its graph wire key is still `"social"`.

## Prompt Architecture Patterns

### Pattern A: Tool-Using Analysts (market, news, fundamentals)

Two-layer structure:

1. **Outer system message** (`ChatPromptTemplate`): generic collaboration wrapper
   with `{tool_names}`, `{system_message}`, `{current_date}`, `{instrument_context}`
2. **Inner `system_message` variable**: domain instructions — the main prompt to edit

```python
system_message = (
    """You are a trading assistant tasked with analyzing ..."""
    + get_language_instruction()          # ← always keep this suffix
)

prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a helpful AI assistant, collaborating with other assistants."
     ...
     " You have access to the following tools: {tool_names}."
     " Today's date is {current_date}; treat it as 'now' for all analysis and"
     " tool-call date ranges. {instrument_context}\n"
     "{system_message}"),
    MessagesPlaceholder(variable_name="messages"),
])
prompt = prompt.partial(system_message=system_message)
prompt = prompt.partial(tool_names=", ".join([t.name for t in tools]))
prompt = prompt.partial(current_date=current_date)
prompt = prompt.partial(instrument_context=instrument_context)
chain = prompt | llm.bind_tools(tools)
```

Edit the `system_message` string inside the `create_*` function. Do not touch the
outer template unless changing the collaboration protocol.

### Pattern B: Sentiment Analyst (pre-fetch + structured, no tool loop)

The sentiment analyst **does not use tool-calling**. It pre-fetches three sources
before the LLM runs and injects them as prompt blocks:

```python
news_block       = get_news.func(ticker, start_date, end_date)   # .func bypasses @tool
stocktwits_block = fetch_stocktwits_messages(ticker, limit=30)
reddit_block     = fetch_reddit_posts(ticker)

system_message = _build_system_message(ticker=..., news_block=..., ...)
formatted_messages = prompt.format_messages(messages=state["messages"])
report_text = invoke_structured_or_freetext(
    structured_llm, llm, formatted_messages, render_sentiment_report, "Sentiment Analyst",
)
```

The prompt is built by the module-level `_build_system_message()` helper — that is
where the analysis best-practices list and output-field descriptions live. The outer
wrapper embeds `NO_EXTERNAL_TOOLS` so the model does not invent a tool call
(schema-only structured output binds exactly one tool).

### Pattern C: Pure Chat Agents (bull, bear, 3 debators)

Direct f-string prompts, no memory argument:

```python
prompt = f"""You are a Bull Analyst advocating for investing in the {target_label}.
...
Resources available:
{instrument_context}
Market research report: {market_research_report}
...
""" + get_language_instruction()

response = llm.invoke(prompt)
```

`target_label` / `fundamentals_label` adapt the wording for `asset_type == "crypto"`.

### Pattern D: Structured Decision Agents (Research Manager, Trader, Portfolio Manager)

These bind a Pydantic schema at **creation** time and invoke through the shared
helper at **run** time:

```python
def create_portfolio_manager(llm):
    structured_llm = bind_structured(llm, PortfolioDecision, "Portfolio Manager")

    def portfolio_manager_node(state) -> dict:
        prompt = f"""As the Portfolio Manager, ..."""
        final_trade_decision = invoke_structured_or_freetext(
            structured_llm, llm, prompt, render_pm_decision, "Portfolio Manager",
        )
```

**The schema field descriptions in `agents/schemas.py` are prompt text.** They are
the model's output instructions. To change output shape or per-field guidance, edit
the `Field(description=...)` strings there — not the prompt body. The prompt body
carries context and rating-scale guidance only.

### Pattern E: Reflector (class-based)

`Reflector._get_log_reflection_prompt()` returns the system prompt used by
`reflect_on_final_decision()`. Output is stored verbatim in the memory log and
re-read by future runs, so the prompt hard-caps it at 2–4 sentences of plain prose.

## Prompt Modification Workflow

1. **Read** the target agent file.
2. **Locate** the prompt: `system_message` (analysts), `prompt` f-string (chat
   agents), `_build_system_message()` (sentiment), or `Field(description=...)`
   in `agents/schemas.py` (output shape).
3. **Draft** the change, preserving required template variables.
4. **Apply** with Edit.
5. **Verify** — see Validation below.

## Key Constraints

- **Keep `+ get_language_instruction()`** on every prompt whose output reaches the
  saved report. Dropping it breaks non-English runs (`output_language` config).
- **Analysts must keep `{tool_names}`, `{current_date}`, `{instrument_context}`**
  in the outer template. There is **no `{ticker}` variable** — ticker identity
  arrives via `instrument_context`, resolved once per run by
  `resolve_instrument_identity()` (deterministic yfinance lookup, cached, fail-open)
  so agents cannot hallucinate a company from the price chart.
- **Researchers/debators receive report variables** by f-string interpolation —
  do not remove `{market_research_report}`, `{sentiment_report}`, `{news_report}`,
  `{fundamentals_report}`.
- **Portfolio Manager reads `{past_context}`** from state (memory-log lessons,
  injected at run start). Preserve the conditional block that wraps it — no other
  agent gets memory context.
- **The 5-tier rating vocabulary is fixed**: Buy / Overweight / Hold / Underweight /
  Sell (`agents/utils/rating.py::RATINGS_5_TIER`). The Research Manager and
  Portfolio Manager must emit one of these; `SignalProcessor.process_signal()` parses
  the rendered `**Rating**: X` header with a regex — no LLM call. Changing the
  vocabulary means updating `rating.py`, `schemas.py::PortfolioRating`, and
  `tests/test_signal_processing.py` together.
- **The Trader's 3-tier action** is Buy / Hold / Sell (`schemas.py::TraderAction`).
  `render_trader_proposal()` appends `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**`
  for backward compatibility — keep it.
- **Structured agents run under a one-tool binding.** If you add "search the web"
  style instructions to a structured agent's prompt, the model emits an unknown
  tool call, the structured attempt is discarded, and it silently degrades to
  free text. Keep `NO_EXTERNAL_TOOLS` wording where present.
- **`render_*` markdown headers are a contract.** `**Rating**`, `**Executive
  Summary**`, `**Investment Thesis**`, `**Overall Sentiment:**` are consumed by
  `reporting.py`, the CLI display, and the memory log.

## Common Modifications

- **Change analysis depth** → `system_message` (analysts) or prompt body (chat agents)
- **Adjust output format** → `Field(description=...)` in `schemas.py` for structured
  agents; markdown-table instructions in `system_message` for prose analysts
- **Tune decision criteria** → the rating-scale guidance in the manager prompts
- **Change debate style** → engagement/tone lines in researcher/debator prompts
- **Change sentiment scoring bands** → `SentimentBand` + `overall_score` description
  in `schemas.py`, and the matching guidance in `_build_system_message()`

## Validation

```bash
python3 -c "from tradingagents.graph.trading_graph import TradingAgentsGraph"
pytest tests/test_structured_agent_prompts.py tests/test_structured_agents.py \
       tests/test_news_analyst_prompt.py tests/test_i18n_coverage.py -q
```

`tests/test_i18n_coverage.py` fails if an agent prompt drops
`get_language_instruction()`. `tests/test_structured_agent_prompts.py` guards the
no-external-tools wording on schema-only agents.

## Additional Resources

- **`references/agent_map.md`** — full 12-agent map with factories, state I/O, tools,
  and schema bindings
