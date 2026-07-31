# TradingAgents — Complete Agent Map

12 graph nodes + 1 non-node prompt owner (Reflector). Line numbers are indicative;
always Read the file before editing.

## Analyst Agents (quick_thinking_llm)

### Market Analyst
- **File**: `tradingagents/agents/analysts/market_analyst.py`
- **Factory**: `create_market_analyst(llm)` → `market_analyst_node(state)`
- **Prompt**: `system_message` variable (line ~24)
- **Tools**: `get_stock_data`, `get_indicators`, `get_verified_market_snapshot`
- **Input state**: `trade_date`, `instrument_context`, `messages`
- **Output state**: `messages`, `market_report`
- **Key behavior**: Selects up to 8 technical indicators from a fixed catalog
  (SMA/EMA/MACD family/RSI/Bollinger/ATR/VWMA). Must call `get_stock_data` first,
  then `get_indicators`, then `get_verified_market_snapshot` before writing — the
  snapshot is the source of truth for any exact OHLCV / price-level / indicator
  claim, and conflicts must be flagged rather than reconciled.
- **Anti-hallucination clause**: "Do not claim historical validation,
  support/resistance bounces, or exact percentage moves unless directly supported
  by tool output with concrete dates and prices." Keep this.

### News Analyst
- **File**: `tradingagents/agents/analysts/news_analyst.py`
- **Factory**: `create_news_analyst(llm)` → `news_analyst_node(state)`
- **Prompt**: `system_message` variable (line ~27), an f-string using `asset_label`
  ("company" for stock, "asset" for crypto)
- **Tools**: `get_news`, `get_global_news`, `get_macro_indicators`,
  `get_prediction_markets`
- **Output state**: `messages`, `news_report`
- **Key behavior**: The prompt names each tool with its signature and lists valid
  FRED indicator keys (`cpi`, `core_pce`, `unemployment`, `fed_funds_rate`,
  `10y_treasury`, `yield_curve`). Adding a macro indicator to `dataflows/fred.py`
  means adding it here too, or the model will not know it exists.

### Fundamentals Analyst
- **File**: `tradingagents/agents/analysts/fundamentals_analyst.py`
- **Factory**: `create_fundamentals_analyst(llm)` → `fundamentals_analyst_node(state)`
- **Prompt**: `system_message` variable (line ~25)
- **Tools**: `get_fundamentals`, `get_balance_sheet`, `get_cashflow`,
  `get_income_statement`
- **Output state**: `messages`, `fundamentals_report`

### Sentiment Analyst
- **File**: `tradingagents/agents/analysts/sentiment_analyst.py`
- **Factory**: `create_sentiment_analyst(llm)` → `sentiment_analyst_node(state)`
- **Deprecated alias**: `create_social_media_analyst(llm)` — emits
  `DeprecationWarning`, delegates to the above
- **Prompt**: module-level `_build_system_message(...)` (line ~126); call site at
  line ~74
- **Tools**: **none bound**. Pre-fetches three sources before the LLM call:
  `get_news.func(ticker, start, end)` (`.func` bypasses the `@tool` wrapper),
  `fetch_stocktwits_messages(ticker, limit=30)`, `fetch_reddit_posts(ticker)`
- **Structured output**: `SentimentReport` → `render_sentiment_report`
- **Output state**: `messages` (one `AIMessage`), `sentiment_report`
- **Why redesigned**: the old `social_media_analyst` demanded social-media analysis
  but only had Yahoo news, so models fabricated Reddit/X/StockTwits content
  (upstream #557, #796). Data is now in the prompt from turn 0.
- **Lookback**: fixed 7 days via `_seven_days_back(trade_date)`

## Researcher Agents (quick_thinking_llm, no memory argument)

### Bull Researcher
- **File**: `tradingagents/agents/researchers/bull_researcher.py`
- **Factory**: `create_bull_researcher(llm)` → `bull_node(state)`
- **Prompt**: `prompt` f-string (line ~27)
- **Input state**: `investment_debate_state`, all 4 reports, `instrument_context`,
  `asset_type`
- **Output state**: `investment_debate_state` (bull argument appended, `count + 1`)
- **Template variables**: `{instrument_context}`, `{market_research_report}`,
  `{sentiment_report}`, `{news_report}`, `{fundamentals_report}`, `{history}`,
  `{current_response}`, plus `{target_label}` / `{fundamentals_label}` for crypto
- **Speaker prefix**: `argument = f"Bull Analyst: {response.content}"` — the
  `"Bull"` prefix is what `should_continue_debate` routes on. Do not change it.

### Bear Researcher
- **File**: `tradingagents/agents/researchers/bear_researcher.py`
- **Factory**: `create_bear_researcher(llm)` → `bear_node(state)`
- **Prompt**: `prompt` f-string (line ~27)
- Same state I/O and variables as Bull; prefix is `"Bear Analyst: "`

## Manager Agents (deep_thinking_llm, structured output)

### Research Manager
- **File**: `tradingagents/agents/managers/research_manager.py`
- **Factory**: `create_research_manager(llm)` → `research_manager_node(state)`
- **Prompt**: `prompt` f-string (line ~26)
- **Structured output**: `ResearchPlan` (`recommendation` / `rationale` /
  `strategic_actions`) → `render_research_plan`
- **Input state**: `investment_debate_state["history"]`, reports
- **Output state**: `investment_debate_state` (with `judge_decision`), `investment_plan`
- **Rating**: 5-tier `PortfolioRating`

### Portfolio Manager (the risk judge — formerly "Risk Manager")
- **File**: `tradingagents/agents/managers/portfolio_manager.py`
- **Factory**: `create_portfolio_manager(llm)` → `portfolio_manager_node(state)`
- **Prompt**: `prompt` f-string (line ~43)
- **Structured output**: `PortfolioDecision` (`rating` / `executive_summary` /
  `investment_thesis` / `price_target?` / `time_horizon?`) → `render_pm_decision`
- **Input state**: `risk_debate_state`, `investment_plan`, `trader_investment_plan`,
  **`past_context`** (memory-log lessons — the only agent that receives it)
- **Output state**: `risk_debate_state` (with `judge_decision`), `final_trade_decision`
- **Node name in the graph**: `"Portfolio Manager"`

## Trader Agent (quick_thinking_llm, structured output)

### Trader
- **File**: `tradingagents/agents/trader/trader.py`
- **Factory**: `create_trader(llm)` → `functools.partial(trader_node, name="Trader")`
- **Prompt**: `messages` list, system + user dicts (line ~29)
- **Structured output**: `TraderProposal` (`action` / `reasoning` / `entry_price?` /
  `stop_loss?` / `position_sizing?`) → `render_trader_proposal`
- **Input state**: `company_of_interest`, `instrument_context`, `investment_plan`
- **Output state**: `messages`, `trader_investment_plan`, `sender`
- **Includes**: `NO_EXTERNAL_TOOLS` in the system message
- **Rendered tail**: `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` (kept for
  back-compat with the analyst stop-signal text and external greps)

## Risk Debator Agents (quick_thinking_llm, no memory)

All three share the same shape: `create_{stance}_debator(llm)` → `{stance}_node(state)`,
prompt f-string at line ~24, ending with
`"Output conversationally as if you are speaking without any special formatting."
+ get_language_instruction()`.

| Stance | File | Speaker label |
|--------|------|---------------|
| Aggressive | `agents/risk_mgmt/aggressive_debator.py` | `Aggressive` |
| Conservative | `agents/risk_mgmt/conservative_debator.py` | `Conservative` |
| Neutral | `agents/risk_mgmt/neutral_debator.py` | `Neutral` |

- **Input state**: `risk_debate_state`, all 4 reports, `trader_investment_plan`
- **Output state**: `risk_debate_state` (updated, `count + 1`, `latest_speaker` set)
- `latest_speaker` drives `should_continue_risk_analysis` — the router matches with
  `.startswith("Aggressive")` / `.startswith("Conservative")`, so the label strings
  are load-bearing.

## Reflector (not a graph node)

- **File**: `tradingagents/graph/reflection.py`
- **Class**: `Reflector(quick_thinking_llm)`
- **System prompt**: `_get_log_reflection_prompt()` (line ~14)
- **Only public method**: `reflect_on_final_decision(final_decision, raw_return,
  alpha_return, benchmark_name="SPY") -> str`
- **Called by**: `TradingAgentsGraph._resolve_pending_entries()` at the start of the
  next same-ticker run (deferred / Phase B reflection)
- **Output contract**: exactly 2–4 sentences of plain prose, no markdown. It is
  stored verbatim in the memory log and re-injected into future prompts, so length
  discipline in this prompt directly controls future context bloat.
- There is **no** per-agent reflection (`reflect_bull_researcher` etc. do not exist
  in this fork).

## LLM Assignment Summary

| LLM | Agents |
|-----|--------|
| `quick_thinking_llm` | 4 analysts, Bull, Bear, Trader, 3 debators, Reflector |
| `deep_thinking_llm` | Research Manager, Portfolio Manager |

## Structured-Output Summary

| Agent | Schema | Renderer |
|-------|--------|----------|
| Sentiment Analyst | `SentimentReport` | `render_sentiment_report` |
| Research Manager | `ResearchPlan` | `render_research_plan` |
| Trader | `TraderProposal` | `render_trader_proposal` |
| Portfolio Manager | `PortfolioDecision` | `render_pm_decision` |

All four go through `agents/utils/structured.py`:
`bind_structured(llm, Schema, name)` at creation, then
`invoke_structured_or_freetext(structured_llm, plain_llm, prompt, render, name)`
at invocation. Any failure (unsupported provider, malformed JSON, a thinking model
answering in prose) logs a warning and falls back to a plain `llm.invoke`, so the
pipeline never blocks.

## Memory / Context Injection

There is no per-agent BM25 memory in this fork. A single append-only markdown log
(`TradingMemoryLog`) supplies `state["past_context"]`, read only by the Portfolio
Manager. See the `ta-memory-manager` skill.
