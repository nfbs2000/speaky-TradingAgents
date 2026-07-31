# Evaluation Guide

## `TradingAgentsGraph` API Reference

### Constructor

```python
TradingAgentsGraph(
    selected_analysts=('market', 'social', 'news', 'fundamentals'),
    debug=False,
    config: dict[str, Any] = None,
    callbacks: list | None = None,
)
```

- `selected_analysts` — a tuple by default; order is execution order. Valid keys:
  `market`, `social`, `news`, `fundamentals`. Unknown key → `ValueError`; empty →
  `ValueError`. It is a **constructor** argument, not a `propagate()` argument and
  not a config key.
- `debug` — `True` uses `graph.stream()` with pretty-printing; `False` uses
  `graph.invoke()`. Both return an equivalent merged final state.
- `config` — full config dict; `None` uses `DEFAULT_CONFIG`.
- `callbacks` — forwarded into the **LLM constructors** (`llm_kwargs["callbacks"]`),
  so they capture LLM calls. Tool-execution callbacks are a separate path:
  `Propagator.get_graph_args(callbacks=...)`.

Constructor side effects: `set_config(config)` (mutates module-global dataflows
config), `mkdir` for `data_cache_dir` and `results_dir`, builds two LLM clients
(**needs an API key**), builds `TradingMemoryLog`, tool nodes, `ConditionalLogic`,
`GraphSetup`, `Propagator`, `Reflector`, `SignalProcessor`, then
`setup_graph()` + `compile()`.

### `propagate()`

```python
final_state, signal = graph.propagate(company_name: str, trade_date: str,
                                      asset_type: str = "stock")
```

Order of operations:

1. `self.ticker = company_name`
2. **`_resolve_pending_entries(company_name)`** — Phase B reflection for prior runs
3. if `checkpoint_enabled`: enter the SqliteSaver context, recompile with the saver,
   log resume/fresh
4. `_run_graph(...)`:
   - `past_context = memory_log.get_past_context(ticker)`
   - `instrument_context = resolve_instrument_context(ticker, asset_type)`
   - `create_initial_state(...)` + `get_graph_args()`
   - `graph.invoke()` (or stream in debug)
   - `_log_state(trade_date, final_state)` → JSON
   - `memory_log.store_decision(...)` → pending entry
   - `clear_checkpoint(...)` on success
   - return `(final_state, process_signal(final_state["final_trade_decision"]))`
5. `finally`: exit the checkpointer context and recompile without it

### `process_signal()`

```python
signal = graph.process_signal(full_signal: str)   # → "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell"
```

`SignalProcessor.process_signal` is a thin wrapper over
`rating.parse_rating(text, default="Hold")`. **No LLM call.** Two passes: an explicit
`Rating: X` label (tolerant of markdown bold and `:` or `-`), then the first 5-tier
rating word anywhere in the text. `SignalProcessor.__init__` still accepts an LLM
argument for backwards compatibility and ignores it.

### `save_reports()`

```python
path = graph.save_reports(final_state, ticker, save_path=None) -> Path
```
Returns the path to `complete_report.md`. Default location:
`{results_dir}/reports/{safe_ticker_component(ticker)}_{YYYYmmdd_HHMMSS}`.

### `resolve_instrument_context()`

```python
ctx = graph.resolve_instrument_context(ticker, asset_type="stock") -> str
```
Deterministic, cached (`functools.lru_cache(maxsize=256)` on
`resolve_instrument_identity`), fail-open yfinance lookup of company name / sector /
etc., formatted into the string injected into every agent prompt (upstream #814).
Called by both `propagate()` and the CLI so identity reaches the graph regardless of
entry point.

### Internal helpers useful for evaluation

```python
graph._resolve_benchmark(ticker) -> str
graph._fetch_returns(ticker, trade_date, holding_days=5, benchmark="SPY")
    -> tuple[float | None, float | None, int | None]   # (raw, alpha, actual_days)
graph._resolve_pending_entries(ticker) -> None
graph._run_signature(asset_type) -> str
graph.memory_log.get_past_context(ticker, n_same=5, n_cross=3) -> str
graph.memory_log.load_entries() -> list[dict]
```

Underscore-prefixed, so they are not a stability promise — but they are the
framework's own return/alpha math, and reimplementing it risks disagreeing with
what the reflections say.

### State tracking attributes

```python
graph.curr_state        # last final_state
graph.ticker            # last ticker
graph.log_states_dict   # {date_str: logged state dict}
graph.selected_analysts # tuple, part of the checkpoint signature
graph.workflow          # uncompiled StateGraph (kept for checkpoint recompiles)
graph.graph             # compiled graph
```

## State Fields Available After `propagate()`

```python
final_state = {
    # Input / run context
    "company_of_interest": str,
    "asset_type": str,            # "stock" | "crypto"
    "instrument_context": str,    # deterministic identity string
    "trade_date": str,
    "past_context": str,          # memory-log lessons injected at run start
    "messages": list,             # LangGraph MessagesState

    # Analyst reports
    "market_report": str,
    "sentiment_report": str,      # rendered SentimentReport (band + score + narrative)
    "news_report": str,
    "fundamentals_report": str,

    # Investment debate
    "investment_debate_state": {
        "bull_history": str, "bear_history": str, "history": str,
        "current_response": str, "judge_decision": str, "count": int,
    },
    "investment_plan": str,          # rendered ResearchPlan

    # Trader
    "trader_investment_plan": str,   # rendered TraderProposal
    "sender": str,                   # "Trader"

    # Risk debate
    "risk_debate_state": {
        "aggressive_history": str, "conservative_history": str,
        "neutral_history": str, "history": str,
        "latest_speaker": str,       # "Judge" after the PM runs
        "current_aggressive_response": str,
        "current_conservative_response": str,
        "current_neutral_response": str,
        "judge_decision": str, "count": int,
    },
    "final_trade_decision": str,     # rendered PortfolioDecision
}
```

## Log File Format

Path: `{results_dir}/{safe_ticker}/TradingAgentsStrategy_logs/full_states_log_{DATE}.json`
(`results_dir` default `~/.tradingagents/logs`).

Written by `_log_state`. Differences from the in-memory state:

- key `trader_investment_decision` ← state key `trader_investment_plan`
- `investment_debate_state` omits `count`
- `risk_debate_state` omits `latest_speaker`, `count`, and the three
  `current_*_response` fields
- `messages`, `asset_type`, `instrument_context`, `past_context` are not logged

`json.dump(..., indent=4)` with `encoding="utf-8"`, so non-English reports round-trip.

## Rendered Output Shapes

Parsing saved reports is easier if you know the deterministic headers:

```
final_trade_decision  →  **Rating**: X
                         **Executive Summary**: ...
                         **Investment Thesis**: ...
                         [**Price Target**: N]
                         [**Time Horizon**: ...]

investment_plan       →  **Recommendation**: X
                         **Rationale**: ...
                         **Strategic Actions**: ...

trader_investment_plan → **Action**: Buy|Hold|Sell
                         **Reasoning**: ...
                         [**Entry Price**: N]  [**Stop Loss**: N]  [**Position Sizing**: ...]
                         FINAL TRANSACTION PROPOSAL: **BUY|HOLD|SELL**

sentiment_report      →  **Overall Sentiment:** **Band** (Score: N.N/10)
                         **Confidence:** Low|Medium|High
                         <narrative>
```

These come from the `render_*` helpers in `agents/schemas.py`. When the structured
call fails and the agent falls back to free text, the headers are **not** guaranteed —
so a parser should tolerate their absence, and a `WARNING` in the logs
("structured-output invocation failed ... retrying once as free text") is the tell.

## Evaluation Metrics

### Signal accuracy
Map the 5-tier rating to a direction (Buy/Overweight → long, Sell/Underweight →
short or flat, Hold → flat) and compare against `_fetch_returns`' realized `raw`.
Track hit rate per tier separately — the framework's own prompts discourage Hold, so
its base rate is informative.

### Alpha, not raw return
`_fetch_returns` already returns alpha vs the ticker's regional benchmark. Grading on
raw return in a rising market flatters every long call.

### Holding-window honesty
`actual_days` can be `< holding_days` near the present or around holidays. Bucket
results by `actual_days` or exclude short windows.

### Agent-level analysis
Read `investment_debate_state["judge_decision"]` vs `final_trade_decision` to see how
often the Portfolio Manager overrides the Research Manager. Compare
`sentiment_report`'s `overall_score` against realized returns for a standalone
sentiment signal — it is numeric and deterministic, so it is the cheapest field to
correlate.

### Memory effectiveness
Two arms with **different `memory_log_path` values**, one seeded with history and one
empty, over the same dates. Without separate paths the arms contaminate each other.

## Common Evaluation Patterns

### Date range
```python
import pandas as pd
dates = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2026-01-02", "2026-03-01")]
```

### Multi-ticker, one graph
```python
graph = TradingAgentsGraph()
for ticker in ["AAPL", "MSFT", "GOOGL", "AMZN"]:
    state, signal = graph.propagate(ticker, "2026-01-15")
    print(f"{ticker}: {signal}")
```
Reuse the instance — one LLM client pair and a warm OHLCV cache. Note each ticker's
pending entries only resolve when that ticker is run again.

### Crypto
```python
state, signal = graph.propagate("BTC-USD", "2026-01-15", asset_type="crypto")
```
`asset_type` changes prompt labels (`"asset"` instead of `"stock"`, and a
fundamentals label noting data may be unavailable) and is part of the checkpoint
signature. `dataflows.symbol_utils.normalize_symbol` maps pair forms like `BTCUSDT`
to `BTC-USD`.

### Cheap sweep
```python
graph = TradingAgentsGraph(
    selected_analysts=("market",),
    config={**DEFAULT_CONFIG, "max_debate_rounds": 1, "max_risk_discuss_rounds": 1,
            "quick_think_llm": "gpt-5.4-nano"},
)
```

### Resumable long run
```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```
Per-ticker SQLite DBs under `data_cache_dir`; the thread ID keys on
ticker + date + graph shape, so a config change starts fresh instead of resuming an
incompatible run. `tradingagents analyze --clear-checkpoints` wipes them.

### Non-English reports
```python
config = {**DEFAULT_CONFIG, "output_language": "Korean"}
```
Internal agent debate stays in English for reasoning quality; only report-facing
output is localized, via `get_language_instruction()`.

## Failure Modes to Expect in a Sweep

| Symptom | Cause | Handling |
|---|---|---|
| `NO_DATA_AVAILABLE: ...` inside a report | every configured vendor lacked data (invalid/delisted/stale) | the prompt tells the model not to fabricate; count the run as unusable |
| `DATA_UNAVAILABLE: optional macro_data ...` | FRED/Polymarket failed | benign; optional categories degrade by design |
| `WARNING ... structured-output invocation failed` | weak model or malformed JSON | the agent fell back to free text; rendered headers not guaranteed |
| `RuntimeWarning: Model 'x' is not in the known model list` | model absent from `MODEL_OPTIONS` | informational only, run proceeds |
| entry stays `pending` forever | ticker never re-run, or prices unavailable | call `_resolve_pending_entries(ticker)` |
| `ValueError: unknown analyst key` | bad `selected_analysts` | use `market`/`social`/`news`/`fundamentals` |
| second arm's vendors misconfigured | `set_config` mutates module globals | one arm per process |
