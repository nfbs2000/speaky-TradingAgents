---
name: ta-memory-manager
description: This skill should be used when the user asks to "manage memory", "reset memory", "clear agent memory", "view memories", "export memory", "import memory", "check learning history", "memory backup", "memory migration", "rotate memory log", "trading_memory.md", or wants to manage the TradingAgents decision-log memory system.
version: 0.2.0
---

# TradingAgents Memory Manager

Manage the append-only markdown decision log that gives TradingAgents its
learning loop.

> **This fork replaced the upstream BM25 memory system.** There is no
> `FinancialSituationMemory`, no `rank_bm25` dependency, no per-agent memory
> stores, and no `reflect_and_remember()`. If a doc, prompt, or issue mentions
> those, it predates this design. See "Migrating from BM25 memory" below.

## Memory Architecture

### `TradingMemoryLog`

`tradingagents/agents/utils/memory.py`. One append-only markdown file, plain-text
readable and hand-editable. No embeddings, no index, no API calls.

- **Path**: `config["memory_log_path"]`, default
  `~/.tradingagents/memory/trading_memory.md` (override with
  `TRADINGAGENTS_MEMORY_LOG_PATH`)
- **Instance**: exactly one, `TradingAgentsGraph.memory_log`
- **Consumer**: exactly one agent — the **Portfolio Manager**, via
  `state["past_context"]`
- **Entry delimiter**: `\n\n<!-- ENTRY_END -->\n\n` (an HTML comment, so it can
  never appear in LLM prose)
- **No-op when unconfigured**: if `memory_log_path` is falsy, every write method
  returns silently and every read returns empty. Memory is effectively off.

### Entry Format

A pending entry (written at the end of every run, no LLM call):

```
[2026-07-24 | NVDA | Buy | pending]

DECISION:
**Rating**: Buy

**Executive Summary**: ...
```

The same entry after its outcome resolves:

```
[2026-07-24 | NVDA | Buy | +6.2% | +2.1% | 5d]

DECISION:
**Rating**: Buy
...

REFLECTION:
The directional call was correct, with +2.1% alpha vs SPY. ...
```

Tag fields: `date | ticker | rating | raw_return | alpha_return | holding_days`,
or `date | ticker | rating | pending`. `rating` is one of the 5-tier scale
(Buy / Overweight / Hold / Underweight / Sell), extracted by
`rating.parse_rating()`.

### Two-Phase Lifecycle

**Phase A — write (end of every `propagate()`)**
```python
self.memory_log.store_decision(ticker, trade_date, final_state["final_trade_decision"])
```
Appends a `| pending]` entry. Idempotent: a fast raw-text scan skips the append if
a pending entry for the same `(trade_date, ticker)` already exists. No LLM call, no
network.

**Phase B — resolve (start of the *next* same-ticker `propagate()`)**
```python
self._resolve_pending_entries(company_name)   # called first thing in propagate()
```
For each pending entry **for that ticker**:
1. `_fetch_returns()` pulls 5 trading days of prices for the ticker and its
   benchmark from yfinance (with a 7-day calendar buffer for weekends/holidays),
   computing `raw` and `alpha = raw - benchmark_return`.
2. Skip if price data is not yet available (too recent, delisted, network error) —
   it retries on a later run.
3. `Reflector.reflect_on_final_decision()` generates a 2–4 sentence reflection
   (one LLM call per resolved entry).
4. All updates are applied in **one** `batch_update_with_outcomes()` call —
   a single read + single atomic write.

Consequence worth knowing: **entries for other tickers accumulate as pending until
that ticker is analyzed again.** This is a deliberate trade-off (one benchmark
fetch and one LLM call per resolved entry, only where the user is already working).

### Read Path

```python
past_context = self.memory_log.get_past_context(company_name)   # n_same=5, n_cross=3
```
Called once per run in `_run_graph()`, injected as `state["past_context"]`.
Returns only **resolved** entries (pending ones have no outcome to learn from):

- up to 5 most-recent same-ticker entries, **full** (tag + DECISION + REFLECTION)
- up to 3 most-recent other-ticker entries, **reflection-only** (or the first 300
  chars of the decision if no reflection exists)

Returns `""` when the log is empty or unconfigured, in which case the Portfolio
Manager's prompt omits the lessons block entirely.

### Benchmark Resolution

`TradingAgentsGraph._resolve_benchmark(ticker)`:
1. `config["benchmark_ticker"]` wins outright when set
   (`TRADINGAGENTS_BENCHMARK_TICKER`).
2. Otherwise `config["benchmark_map"]` matches the exchange suffix —
   `.NS`→`^NSEI`, `.BO`→`^BSESN`, `.T`→`^N225`, `.HK`→`^HSI`, `.L`→`^FTSE`,
   `.TO`→`^GSPTSE`, `.AX`→`^AXJO`, `.SS`→`000001.SS`, `.SZ`→`399001.SZ`.
3. Fallback is the empty-suffix entry, `SPY`. US tickers containing a dot
   (e.g. `BRK.B`) also land here, which is correct — the alpha math is in USD.

The resolved benchmark name is threaded into the reflection prompt, so the stored
reflection reads "alpha vs ^N225" for a Tokyo listing rather than always "SPY".

## Key Operations

### View the log
```bash
cat "${TRADINGAGENTS_MEMORY_LOG_PATH:-$HOME/.tradingagents/memory/trading_memory.md}"
```

### Inspect parsed entries
```python
from tradingagents.agents.utils.memory import TradingMemoryLog
from tradingagents.default_config import DEFAULT_CONFIG

log = TradingMemoryLog(DEFAULT_CONFIG)
entries = log.load_entries()
print(f"{len(entries)} entries, {len(log.get_pending_entries())} pending")
for e in entries[-3:]:
    print(e["date"], e["ticker"], e["rating"],
          "pending" if e["pending"] else f"{e['raw']} / {e['alpha']} / {e['holding']}")
```

Each parsed entry is a dict: `date`, `ticker`, `rating`, `pending` (bool),
`raw`, `alpha`, `holding` (strings or `None`), `decision`, `reflection`.

### Preview what the Portfolio Manager will see
```python
print(log.get_past_context("NVDA"))
print(log.get_past_context("NVDA", n_same=10, n_cross=0))   # tune the window
```

### Clear memory
There is no `clear()` method — the log is a file:
```bash
rm ~/.tradingagents/memory/trading_memory.md          # wipe
mv ~/.tradingagents/memory/trading_memory.md{,.bak}   # archive
```
Deleting it is safe: `TradingMemoryLog.__init__` re-creates the parent directory,
and `store_decision` creates the file on the next run.

### Backup / restore
```bash
cp ~/.tradingagents/memory/trading_memory.md ./trading_memory.$(date +%Y%m%d).md
```
Plain markdown — copy, diff, `git`-track, or hand-edit it. Preserve the
`<!-- ENTRY_END -->` separators and the `[...]` tag line format or entries will be
silently skipped by `_parse_entry()` (it requires a bracketed first line with at
least 4 pipe-separated fields).

### Seed a memory by hand
Append a resolved entry directly:
```
[2026-01-15 | AAPL | Hold | +0.4% | -1.2% | 5d]

DECISION:
**Rating**: Hold

REFLECTION:
Sitting out was roughly right on direction but cost 1.2% of alpha against SPY.
The thesis under-weighted the services-margin story. Next time, weight recurring
revenue trend above the hardware cycle read.

<!-- ENTRY_END -->

```

### Cap log growth
```python
"memory_log_max_entries": 200,   # None (default) disables rotation
```
`_apply_rotation()` runs on every outcome update and drops the **oldest resolved**
entries once the resolved count exceeds the cap. **Pending entries are never
pruned** — they represent unprocessed work. Rotation never runs on the append
path, only on updates, so a log with no resolutions grows unbounded regardless of
this setting.

### Force-resolve pending entries
Reflection is deferred by design; there is no CLI command for it. Trigger it by
re-running the ticker, or drive it directly:
```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
g = TradingAgentsGraph()
g._resolve_pending_entries("NVDA")   # needs an API key + network
```

## Durability

`update_with_outcome()` and `batch_update_with_outcomes()` write to
`<log>.tmp` then `Path.replace()` onto the target, so a crash mid-write cannot
corrupt the log. `store_decision()` uses a plain `open(..., "a")` append — a
partial append is possible in principle, but an entry without its
`<!-- ENTRY_END -->` terminator simply parses as the last block.

## Migrating from BM25 memory

If you are porting code or docs written against the upstream memory system:

| Upstream (BM25) | This fork |
|---|---|
| `FinancialSituationMemory(name, config)` | `TradingMemoryLog(config)` — one instance, not five |
| `bull_memory`, `bear_memory`, `trader_memory`, `invest_judge_memory`, `risk_manager_memory` | none; only the Portfolio Manager reads memory |
| `memory.get_memories(situation, n_matches=2)` | `log.get_past_context(ticker, n_same=5, n_cross=3)` |
| `memory.add_situations([(sit, rec)])` | `log.store_decision(ticker, date, decision)` (pending) |
| `memory.clear()` | delete the log file |
| `graph.reflect_and_remember(returns)` | automatic Phase B on the next same-ticker run |
| `create_bull_researcher(llm, memory)` | `create_bull_researcher(llm)` — no memory argument |
| `Reflector.reflect_bull_researcher(...)` etc. | only `Reflector.reflect_on_final_decision(...)` |
| similarity retrieval (lexical match) | recency + ticker match (no scoring) |

`main.py` still carries a commented-out `ta.reflect_and_remember(1000)` line; it is
stale, not a live API.

## Files to Modify

| Operation | File |
|-----------|------|
| Log format, parsing, rotation | `tradingagents/agents/utils/memory.py` |
| Reflection prompt / output shape | `tradingagents/graph/reflection.py` |
| Phase B orchestration, return & benchmark fetch | `tradingagents/graph/trading_graph.py` (`_resolve_pending_entries`, `_fetch_returns`, `_resolve_benchmark`) |
| Context injection into state | `tradingagents/graph/trading_graph.py` (`_run_graph`) + `graph/propagation.py` |
| Which agent reads `past_context` | `tradingagents/agents/managers/portfolio_manager.py` |
| Rating vocabulary in the tag | `tradingagents/agents/utils/rating.py` |
| Path / rotation config | `tradingagents/default_config.py` |

## Validation

```bash
pytest tests/test_memory_log.py -q
```

## Additional Resources

- **`references/memory_internals.md`** — full class API, parsing rules, rotation
  semantics, and the reflection prompt contract
