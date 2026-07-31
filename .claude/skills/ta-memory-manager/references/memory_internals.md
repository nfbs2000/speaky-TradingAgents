# Memory System Internals

## `TradingMemoryLog` API

```python
class TradingMemoryLog:
    _SEPARATOR    = "\n\n<!-- ENTRY_END -->\n\n"
    _DECISION_RE   = re.compile(r"DECISION:\n(.*?)(?=\nREFLECTION:|\Z)", re.DOTALL)
    _REFLECTION_RE = re.compile(r"REFLECTION:\n(.*?)$", re.DOTALL)

    def __init__(self, config: dict = None)

    # Write (Phase A)
    def store_decision(ticker: str, trade_date: str, final_trade_decision: str) -> None

    # Read
    def load_entries() -> list[dict]
    def get_pending_entries() -> list[dict]
    def get_past_context(ticker: str, n_same: int = 5, n_cross: int = 3) -> str

    # Update (Phase B)
    def update_with_outcome(ticker, trade_date, raw_return, alpha_return,
                            holding_days, reflection) -> None
    def batch_update_with_outcomes(updates: list[dict]) -> None

    # Helpers (private)
    def _apply_rotation(blocks: list[str]) -> list[str]
    def _parse_entry(raw: str) -> dict | None
    def _format_full(e: dict) -> str
    def _format_reflection_only(e: dict) -> str
```

`__init__` reads two config keys and nothing else:

```python
path = config.get("memory_log_path")
if path:
    self._log_path = Path(path).expanduser()
    self._log_path.parent.mkdir(parents=True, exist_ok=True)
self._max_entries = config.get("memory_log_max_entries")
```

`self._log_path is None` ⇒ every method is a no-op / returns empty. That is the
"memory disabled" state; it is not an error.

## Parsing Rules

`load_entries()` splits the whole file on `_SEPARATOR`, strips each block, drops
empties, and runs `_parse_entry()` on the rest. A block is skipped (returns `None`)
when:

- it is empty, or
- its first line does not both start with `[` and end with `]`, or
- the tag line has fewer than 4 pipe-separated fields.

Field mapping from `[f0 | f1 | f2 | f3 | f4 | f5]`:

| Field | Key | Notes |
|-------|-----|-------|
| f0 | `date` | `YYYY-MM-DD` |
| f1 | `ticker` | as passed to `propagate()` |
| f2 | `rating` | 5-tier label from `parse_rating()` |
| f3 | `pending` | `True` iff the literal string `pending` |
| f3 | `raw` | the same field re-read as raw return; `None` when pending |
| f4 | `alpha` | `None` if absent |
| f5 | `holding` | e.g. `5d`; `None` if absent |

Body parsing: `decision` is everything after `DECISION:\n` up to `\nREFLECTION:`
(or end of block); `reflection` is everything after `REFLECTION:\n`. Both default
to `""`.

**Implication for hand-editing**: the literal headers `DECISION:` and
`REFLECTION:` must each be on their own line, followed immediately by content on
the next line. Indenting them or adding a blank line after the colon breaks the
regex and yields an empty field — silently.

## Idempotency Guard on Append

`store_decision()` does a line-prefix scan of the raw file rather than a full
parse:

```python
for line in raw.splitlines():
    if line.startswith(f"[{trade_date} | {ticker} |") and line.endswith("| pending]"):
        return
```

So re-running the same ticker+date does not duplicate a pending entry — but once
that entry is **resolved** (no longer ends with `| pending]`), a re-run appends a
fresh pending entry for the same date. Repeated re-runs of an already-resolved
date therefore accumulate entries.

## Update Semantics

Both update methods:

1. Read the whole file, split on `_SEPARATOR`.
2. For each block, compare `lines[0].strip()` against
   `f"[{trade_date} | {ticker} |"` (prefix) and `"| pending]"` (suffix).
3. On match, re-parse the rating out of `fields[2]`, build the resolved tag, and
   append `\n\nREFLECTION:\n{reflection}`.
4. Apply rotation, join, write to `<log>.tmp`, `Path.replace()` onto the log.

Differences:

- `update_with_outcome()` updates **only the first** matching pending entry
  (`if not updated and ...`) and returns without writing at all if nothing matched.
- `batch_update_with_outcomes()` builds an `{(trade_date, ticker): update}` map and
  consumes each key on first match (`del update_map[...]`), so each update lands on
  exactly one block. It writes even if some updates found no match. Required keys
  per update dict: `ticker`, `trade_date`, `raw_return`, `alpha_return`,
  `holding_days`, `reflection`.

Return formatting is `f"{value:+.1%}"` — so `0.062` renders as `+6.2%`. Pass
**fractions**, not percentages: `0.062`, not `6.2`.

## Rotation Semantics

```python
def _apply_rotation(self, blocks):
    if not self._max_entries or self._max_entries <= 0:
        return blocks                       # disabled
    # classify each block: resolved iff tag line is bracketed and NOT "| pending]"
    if resolved_count <= self._max_entries:
        return blocks
    # drop the first (oldest) `resolved_count - max_entries` resolved blocks
```

- Runs **only** from the two update methods, never from `store_decision()`.
- Pending blocks are always kept.
- Whitespace-only blocks are classified non-resolved and preserved.

## Reflection Prompt Contract

`Reflector._get_log_reflection_prompt()` demands, verbatim:

- exactly 2–4 sentences of plain prose, no bullets/headers/markdown
- in order: (1) was the directional call correct, citing the alpha figure;
  (2) which part of the thesis held or failed; (3) one concrete lesson

The human message supplies:
```
Raw return: {raw_return:+.1%}
Alpha vs {benchmark_name}: {alpha_return:+.1%}

Final Decision:
{final_decision}
```

Because the output is stored verbatim and re-injected into future Portfolio Manager
prompts, loosening the length cap here directly inflates every future run's context.

## Return & Alpha Computation

`TradingAgentsGraph._fetch_returns(ticker, trade_date, holding_days=5, benchmark="SPY")`:

```python
start = datetime.strptime(trade_date, "%Y-%m-%d")
end   = start + timedelta(days=holding_days + 7)     # weekend/holiday buffer
stock = yf.Ticker(normalize_symbol(ticker)).history(start=trade_date, end=end_str)
bench = yf.Ticker(benchmark).history(start=trade_date, end=end_str)
if len(stock) < 2 or len(bench) < 2:
    return None, None, None
actual_days = min(holding_days, len(stock) - 1, len(bench) - 1)
raw   = (stock.Close[actual_days] - stock.Close[0]) / stock.Close[0]
alpha = raw - (bench.Close[actual_days] - bench.Close[0]) / bench.Close[0]
```

- The ticker goes through `dataflows.symbol_utils.normalize_symbol()` so the
  realized-return lookup hits the same instrument the analysis priced
  (e.g. `XAUUSD` → `GC=F`, upstream #984). The benchmark is already canonical.
- `actual_days` can be **less than 5** near the present or around holidays; the
  real value is what gets stored in the `Nd` tag field.
- Any exception is caught, logged at WARNING ("will retry next run"), and returns
  `(None, None, None)` so the entry stays pending.

## Phase B Orchestration

```python
def _resolve_pending_entries(self, ticker):
    pending = [e for e in self.memory_log.get_pending_entries() if e["ticker"] == ticker]
    if not pending:
        return
    benchmark = self._resolve_benchmark(ticker)
    updates = []
    for entry in pending:
        raw, alpha, days = self._fetch_returns(ticker, entry["date"], benchmark=benchmark)
        if raw is None:
            continue                       # retry on a later run
        reflection = self.reflector.reflect_on_final_decision(
            final_decision=entry.get("decision", ""),
            raw_return=raw, alpha_return=alpha, benchmark_name=benchmark,
        )
        updates.append({...})
    if updates:
        self.memory_log.batch_update_with_outcomes(updates)
```

Called as the **first statement** of `propagate()`, before the checkpointer is set
up and before the graph runs — so a run always learns from prior outcomes before
producing a new decision.

Cost per run: one yfinance history pair + one quick-LLM call per resolvable pending
entry **for that ticker only**.

## Adding a Second Memory Consumer

To let another agent see `past_context`:

1. It is already in `AgentState` (`past_context`) and set by
   `Propagator.create_initial_state()` — no state change needed.
2. In the agent node, read it: `past_context = state.get("past_context", "")`.
3. Wrap it in a conditional prompt block so an empty log adds no tokens — copy the
   pattern from `portfolio_manager.py`:
   ```python
   lessons_block = (
       f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
       if past_context else ""
   )
   ```
4. Consider the token cost: `get_past_context` returns up to 5 full decisions plus
   3 reflections. Pass a smaller `n_same` / `n_cross` at the call site in
   `_run_graph()` if you widen the audience.

## What Was Removed vs Upstream

Not present in this fork: `rank_bm25` dependency, `FinancialSituationMemory`,
`_tokenize`, `_rebuild_index`, `BM25Okapi` (`k1`/`b`/`epsilon` tuning),
`similarity_score`, `n_matches`, the five per-agent memory instances,
`reflect_and_remember`, and `Reflector.reflect_{bull_researcher,bear_researcher,
trader,invest_judge,risk_manager}`.

Trade-offs of the replacement: no similarity retrieval (recency + exact ticker
match only), human-readable and git-diffable state, zero extra dependencies,
survives process exit by default, and reflection is deferred so it can use *real
realized returns* instead of a caller-supplied string.
