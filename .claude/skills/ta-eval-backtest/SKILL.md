---
name: ta-eval-backtest
description: This skill should be used when the user asks to "run backtest", "evaluate strategy", "test trading performance", "analyze results", "compare models", "run evaluation", "test on AAPL", "backtest January", "check agent accuracy", "A/B test models", "analyze trading results", "run crypto analysis", or wants to run and analyze TradingAgents backtests and evaluations.
version: 0.2.0
---

# TradingAgents Evaluation & Backtest

Run evaluations, analyze results, and compare configurations.

## Core API

### Single Evaluation

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph

graph = TradingAgentsGraph(
    selected_analysts=("market", "social", "news", "fundamentals"),
    debug=False,
    config=None,       # None → DEFAULT_CONFIG
    callbacks=None,    # LangChain callbacks, forwarded to the LLM constructors
)

final_state, signal = graph.propagate("AAPL", "2026-01-15")
# signal ∈ {"Buy", "Overweight", "Hold", "Underweight", "Sell"}
```

**Three differences from the upstream API worth internalizing:**

1. **The signal is 5-tier, Title-cased** — `Buy` / `Overweight` / `Hold` /
   `Underweight` / `Sell`, not `BUY`/`SELL`/`HOLD`. Code branching on `"BUY"` will
   silently never match.
2. **`process_signal()` makes no LLM call.** The Portfolio Manager's structured
   output always renders a `**Rating**: X` header, so `SignalProcessor` just runs
   `rating.parse_rating()` (regex + word scan, default `"Hold"`).
3. **`propagate()` takes a third argument**: `asset_type="stock" | "crypto"`.

```python
final_state, signal = graph.propagate("BTC-USD", "2026-01-15", asset_type="crypto")
```

### Reflection — automatic, not a method call

There is **no `graph.reflect_and_remember(returns)`**. Reflection is deferred:

- `propagate()` ends by appending a `| pending]` entry to the memory log.
- The **next** `propagate()` for the same ticker resolves it: it fetches 5 trading
  days of real returns plus the benchmark, computes alpha, and asks the LLM for a
  2–4 sentence reflection.

So a backtest loop over consecutive dates for one ticker learns as it goes, with no
extra calls from you. `main.py` still carries a commented-out
`ta.reflect_and_remember(1000)` — it is stale.

To force resolution without a new analysis:
```python
graph._resolve_pending_entries("AAPL")
```

### Saving Reports

```python
path = graph.save_reports(final_state, "AAPL")                    # under results_dir/reports/
path = graph.save_reports(final_state, "AAPL", save_path="./out") # explicit
```

Produces the same on-disk tree the CLI does, via `reporting.write_report_tree()`:

```
{save_path}/
├── 1_analysts/{market,sentiment,news,fundamentals}.md
├── 2_research/{bull,bear,manager}.md
├── 3_trading/trader.md
├── 4_risk/{aggressive,conservative,neutral}.md
├── 5_portfolio/decision.md
└── complete_report.md
```

The default `save_path` is
`{results_dir}/reports/{safe_ticker}_{YYYYmmdd_HHMMSS}`. Sections are written only
when the corresponding state field is non-empty, so a partial run yields a partial tree.

## Result Log Structure

Every `propagate()` also writes a JSON state log — note the path is under
`results_dir`, **not** `eval_results/`:

```
{results_dir}/{TICKER}/TradingAgentsStrategy_logs/full_states_log_{DATE}.json
```

`results_dir` defaults to `~/.tradingagents/logs`
(`TRADINGAGENTS_RESULTS_DIR` to override). The ticker goes through
`safe_ticker_component()` so it cannot escape the directory.

The JSON holds:
`company_of_interest`, `trade_date`, `market_report`, `sentiment_report`,
`news_report`, `fundamentals_report`,
`investment_debate_state` (bull_history, bear_history, history, current_response,
judge_decision — **no `count`**),
`trader_investment_decision` (note: the JSON key differs from the state key
`trader_investment_plan`),
`risk_debate_state` (aggressive/conservative/neutral history, history,
judge_decision), `investment_plan`, `final_trade_decision`.

## Backtest Workflow

### 1. Pick trading dates

```python
import pandas as pd
dates = [d.strftime("%Y-%m-%d")
         for d in pd.bdate_range(start="2026-01-02", end="2026-03-01")]
```

Business days only. Exchange holidays still slip through — a run on a holiday
usually still works because the OHLCV loader takes the latest row on or before the
date, but the realized-return window shifts.

### 2. Run sequentially, reusing one graph

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph

graph = TradingAgentsGraph(debug=False)      # reuse: one LLM client pair, warm cache
results = {}
for date in dates:
    try:
        state, signal = graph.propagate("AAPL", date)
        results[date] = signal
        print(f"{date}: {signal}")
    except Exception as e:
        print(f"{date}: ERROR - {e}")
        results[date] = "ERROR"
```

Reusing the instance also means the memory log resolves each prior date as you go —
by the end, earlier entries carry real reflections.

Set `checkpoint_enabled` for long sweeps so a crash mid-date resumes instead of
re-running the whole graph:

```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```

### 3. Score signals against realized returns

The framework already has this — do not reimplement it:

```python
raw, alpha, days = graph._fetch_returns("AAPL", date, holding_days=5,
                                        benchmark=graph._resolve_benchmark("AAPL"))
```

Returns `(None, None, None)` when prices are unavailable (too recent, delisted,
network error). `_resolve_benchmark` picks the regional index from the ticker suffix
(`.T`→`^N225`, `.L`→`^FTSE`, …), defaulting to `SPY`.

### 4. Read the accumulated reflections

```python
print(graph.memory_log.get_past_context("AAPL", n_same=20, n_cross=0))
```

Or read the markdown log directly — it is the audit trail:
```bash
cat ~/.tradingagents/memory/trading_memory.md
```

## A/B Testing Configurations

```python
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

config_a = {**DEFAULT_CONFIG, "llm_provider": "openai",
            "deep_think_llm": "gpt-5.5", "quick_think_llm": "gpt-5.4-mini"}
config_b = {**DEFAULT_CONFIG, "llm_provider": "anthropic",
            "deep_think_llm": "claude-fable-5", "quick_think_llm": "claude-haiku-4-5"}

graph_a = TradingAgentsGraph(config=config_a)
graph_b = TradingAgentsGraph(config=config_b)
```

**Isolate the memory log per arm, or arm B learns from arm A's decisions:**

```python
config_a["memory_log_path"] = "./ab/arm_a_memory.md"
config_b["memory_log_path"] = "./ab/arm_b_memory.md"
```

Same for `results_dir` if you want separate JSON logs.

**Reducing run-to-run variance**: set `"temperature": 0`. It is forwarded to every
provider, but reasoning models largely ignore it and **no setting makes LLM output
bit-identical across runs**. Treat single-run A/B deltas as noise; compare
distributions over many dates.

**One `set_config` caveat**: `TradingAgentsGraph.__init__` calls
`dataflows.config.set_config(self.config)`, which mutates **module-global** state.
Two graphs in one process share that global, so the second constructor's vendor
settings win for both. Construct and run one arm at a time, or run arms in separate
processes.

## Key Configuration for Evaluation

```python
"results_dir":              "~/.tradingagents/logs",     # TRADINGAGENTS_RESULTS_DIR
"data_cache_dir":           "~/.tradingagents/cache",    # TRADINGAGENTS_CACHE_DIR
"memory_log_path":          "~/.tradingagents/memory/trading_memory.md",
"memory_log_max_entries":   None,       # cap resolved entries
"max_debate_rounds":        1,          # cost/quality knob: turns = 2 × this
"max_risk_discuss_rounds":  1,          # turns = 3 × this
"checkpoint_enabled":       False,
"benchmark_ticker":         None,       # override alpha baseline for all tickers
"temperature":              None,
"llm_max_retries":          None,       # raise to ride out bursty 429s
"output_language":          "English",
```

`selected_analysts` is a **constructor argument**, not a config key.

## Cost Control

Rough LLM-call budget per run: 4 analysts (×N tool rounds) +
`2 × max_debate_rounds` researcher turns + 1 research manager + 1 trader +
`3 × max_risk_discuss_rounds` debator turns + 1 portfolio manager
+ 1 reflection per resolvable pending entry. `process_signal` costs nothing.

Cheapest meaningful config: `selected_analysts=("market",)` with both round counts
at 1.

Token tracking via callbacks (forwarded to the LLM constructors):
```python
from langchain_community.callbacks import get_openai_callback
with get_openai_callback() as cb:
    state, signal = graph.propagate("AAPL", "2026-01-15")
    print(cb.total_tokens, cb.total_cost)
```
`langchain_community` is not a declared dependency — install it separately.
The CLI uses its own `cli/stats_handler.py` instead.

## Analyzing Saved Logs

```python
import json
from pathlib import Path
from tradingagents.default_config import DEFAULT_CONFIG

logs = Path(DEFAULT_CONFIG["results_dir"]) / "AAPL" / "TradingAgentsStrategy_logs"
for f in sorted(logs.glob("full_states_log_*.json")):
    state = json.load(f.open())
    print(state["trade_date"], state["final_trade_decision"][:80].replace("\n", " "))
```

## Helper Script

`scripts/run_single_eval.py` — one ticker/date run with provider, model, analyst,
asset-type, and report-saving flags:

```bash
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py AAPL 2026-01-15
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py BTC-USD 2026-01-15 --asset-type crypto
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py MSFT 2026-02-02 \
    --analysts market,fundamentals --save-reports ./out --json
```

## Validation

```bash
python3 -c "
import inspect
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.agents.utils.rating import RATINGS_5_TIER
print('propagate', inspect.signature(TradingAgentsGraph.propagate))
print('ratings', RATINGS_5_TIER)
print('has reflect_and_remember:', hasattr(TradingAgentsGraph, 'reflect_and_remember'))
"
pytest tests/test_signal_processing.py tests/test_reporting.py \
       tests/test_memory_log.py tests/test_crypto_asset_mode.py \
       tests/test_date_boundaries.py -q
```

Expect `has reflect_and_remember: False`.

## Additional Resources

- **`scripts/run_single_eval.py`** — single ticker/date runner
- **`references/evaluation_guide.md`** — full API surface, state-field reference,
  metrics, and evaluation patterns
