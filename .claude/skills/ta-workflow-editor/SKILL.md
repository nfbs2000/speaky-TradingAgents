---
name: ta-workflow-editor
description: This skill should be used when the user asks to "change agent order", "modify workflow", "edit graph", "disable analyst", "enable analyst", "change debate rounds", "modify routing", "add workflow step", "change agent sequence", "parallel analysis", "skip news analyst", "enable checkpoint resume", or wants to modify the LangGraph workflow structure of TradingAgents.
version: 0.2.0
---

# TradingAgents Workflow Editor

Modify the LangGraph workflow that orchestrates the 12 TradingAgents agents.

## Current Workflow

```
START
  → Market Analyst        (+ tools_market loop → Msg Clear Market)
  → Sentiment Analyst     (no tool loop in practice — see note → Msg Clear Sentiment)
  → News Analyst          (+ tools_news loop → Msg Clear News)
  → Fundamentals Analyst  (+ tools_fundamentals loop → Msg Clear Fundamentals)
  → Bull Researcher ←→ Bear Researcher   (debate, 2 × max_debate_rounds turns)
  → Research Manager      (investment_plan, structured)
  → Trader                (trader_investment_plan, structured)
  → Aggressive → Conservative → Neutral  (risk debate, 3 × max_risk_discuss_rounds turns)
  → Portfolio Manager     (final_trade_decision, structured)
END
```

> **Note on the Sentiment Analyst**: `tools_social` is still registered as a node
> and wired as a conditional target, but `create_sentiment_analyst` does not call
> `bind_tools`, so `last_message.tool_calls` is empty and the router always takes
> the `Msg Clear Sentiment` branch. The tool node is a vestigial-but-harmless
> safety edge. Do not delete it without also removing the `tools_social` entry
> from `ANALYST_NODE_SPECS` and `_create_tool_nodes()`.

## Key Files

| File | Responsibility |
|------|---------------|
| `graph/setup.py` | `GraphSetup.setup_graph()` — builds the `StateGraph`, returns the **uncompiled** workflow |
| `graph/analyst_execution.py` | `ANALYST_NODE_SPECS` — the node-name registry; `build_analyst_execution_plan()`; `AnalystWallTimeTracker` |
| `graph/conditional_logic.py` | `ConditionalLogic` — routing functions for tool loops and both debates |
| `graph/trading_graph.py` | `TradingAgentsGraph` — orchestrator: LLM clients, tool nodes, memory log, compile, propagate |
| `graph/propagation.py` | `Propagator.create_initial_state()`, `get_graph_args()` |
| `graph/checkpointer.py` | SQLite checkpoint/resume helpers |
| `default_config.py` | `max_debate_rounds`, `max_risk_discuss_rounds`, `max_recur_limit`, `checkpoint_enabled` |

## The Node-Name Registry

Analyst node names are **not** string literals in `setup.py`. They come from
`ANALYST_NODE_SPECS` in `graph/analyst_execution.py`:

```python
ANALYST_NODE_SPECS = {
    "market":       AnalystNodeSpec("market",       "Market Analyst",       "Msg Clear Market",       "tools_market",       "market_report"),
    "social":       AnalystNodeSpec("social",       "Sentiment Analyst",    "Msg Clear Sentiment",    "tools_social",       "sentiment_report"),
    "news":         AnalystNodeSpec("news",         "News Analyst",         "Msg Clear News",         "tools_news",         "news_report"),
    "fundamentals": AnalystNodeSpec("fundamentals", "Fundamentals Analyst", "Msg Clear Fundamentals", "tools_fundamentals", "fundamentals_report"),
}
```

The wire key `"social"` is kept for saved-config back-compat while the display
label is `"Sentiment Analyst"`. If you rename a node, change it **here** — the
setup loop, the wall-time tracker, and the CLI status display all read from this
one table. The matching `ConditionalLogic.should_continue_social()` must keep
returning `"Msg Clear Sentiment"` (its method name stays `_social` because the
setup loop resolves the router by `getattr(logic, f"should_continue_{spec.key}")`).

## Common Modifications

### 1. Enable / Disable Analysts

`selected_analysts` is a **constructor** argument on `TradingAgentsGraph`, not a
`propagate()` argument:

```python
graph = TradingAgentsGraph(selected_analysts=["market", "fundamentals"])
```

Valid keys: `"market"`, `"social"`, `"news"`, `"fundamentals"`. An unknown key
raises `ValueError: unknown analyst key: ...`; an empty list raises
`ValueError: at least one analyst must be selected`.

Default (both `GraphSetup.setup_graph` and `TradingAgentsGraph.__init__`) is the
tuple `("market", "social", "news", "fundamentals")`.

### 2. Change Analyst Order

Reorder `selected_analysts`. The first spec is wired from `START`, each
`Msg Clear` connects to the next analyst, and the last one connects to
`Bull Researcher`. Analysts run **sequentially** — there is no parallel fan-out.

```python
TradingAgentsGraph(selected_analysts=["fundamentals", "market", "social", "news"])
```

Note `selected_analysts` is part of the checkpoint signature
(`_run_signature()`), so changing it invalidates any saved checkpoint rather than
silently resuming the old graph shape.

### 3. Adjust Debate Rounds

In `default_config.py` (or via env var):

```python
"max_debate_rounds": 1,         # TRADINGAGENTS_MAX_DEBATE_ROUNDS — Bull/Bear: total turns = 2 × rounds
"max_risk_discuss_rounds": 1,   # TRADINGAGENTS_MAX_RISK_ROUNDS  — 3-way rotation: total turns = 3 × rounds
"max_recur_limit": 100,         # LangGraph recursion limit (no env override)
```

`ConditionalLogic` exits the investment debate when
`investment_debate_state["count"] >= 2 * max_debate_rounds`, and the risk debate
when `risk_debate_state["count"] >= 3 * max_risk_discuss_rounds`.

### 4. Modify Routing Logic

In `graph/conditional_logic.py`:

- **Analyst tool loops**: `should_continue_{key}` returns the spec's `tool_node`
  when `last_message.tool_calls` is truthy, else the spec's `clear_node`.
- **Investment debate**: `should_continue_debate` returns `"Research Manager"`
  once the count is reached; otherwise `"Bear Researcher"` if
  `current_response.startswith("Bull")`, else `"Bull Researcher"`.
- **Risk debate**: `should_continue_risk_analysis` returns `"Portfolio Manager"`
  once the count is reached; otherwise rotates on `latest_speaker` —
  `startswith("Aggressive")` → Conservative, `startswith("Conservative")` →
  Neutral, else Aggressive.

Both debate routers are wired with **complete path maps** rather than target lists:

```python
DEBATE_PATH_MAP = {"Bull Researcher": ..., "Bear Researcher": ..., "Research Manager": ...}
RISK_ANALYSIS_PATH_MAP = {"Aggressive Analyst": ..., "Conservative Analyst": ...,
                          "Neutral Analyst": ..., "Portfolio Manager": ...}
```

Every edge driven by a shared router maps **all** of its possible returns, so a
fall-through return (e.g. under prompt / i18n / refactor drift in the speaker
labels) cannot hit a missing `path_map` entry and crash LangGraph mid-run
(upstream #1088). **If you add a router return value, add it to the path map** —
`tests/test_risk_router_path_map.py` enforces this.

### 5. Add New Workflow Steps

In `graph/setup.py`, inside `setup_graph()`:

1. Create the node function.
2. `workflow.add_node("Node Name", node_fn)`.
3. Rewire edges: remove the old edge, add edges through the new node.

Example — inserting a node between Trader and the risk debate:

```python
workflow.add_node("Risk Preprocessor", risk_preprocessor_fn)
# replace: workflow.add_edge("Trader", "Aggressive Analyst")
workflow.add_edge("Trader", "Risk Preprocessor")
workflow.add_edge("Risk Preprocessor", "Aggressive Analyst")
```

### 6. Enable Checkpoint / Resume

```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```
or `TRADINGAGENTS_CHECKPOINT_ENABLED=true`, or `tradingagents analyze --checkpoint`.

When enabled, `propagate()` recompiles the workflow with a per-ticker
`SqliteSaver` (under `data_cache_dir`) and injects a deterministic `thread_id`
built from ticker + date + `_run_signature()` (analysts, debate depth, risk depth,
asset type). This is why `setup_graph()` returns the **uncompiled** workflow and
`TradingAgentsGraph` keeps it on `self.workflow` — it must be recompilable.
`tradingagents analyze --clear-checkpoints` wipes all checkpoint DBs.

## Graph Construction Pattern

`setup_graph(selected_analysts)`:

1. `plan = build_analyst_execution_plan(selected_analysts)` — validates keys, resolves specs
2. Build `analyst_factories` (lambdas over `quick_thinking_llm`)
3. Create researcher / manager / trader / risk nodes — **all take only `llm`**, no memory argument
4. `workflow = StateGraph(AgentState)`
5. Per spec: add `agent_node`, `clear_node`, `tool_node`
6. Add the 8 fixed nodes (Bull, Bear, Research Manager, Trader, Aggressive, Neutral, Conservative, Portfolio Manager)
7. `add_edge(START, plan.specs[0].agent_node)`; chain analysts; last `clear_node` → `Bull Researcher`
8. Conditional edges for both debates using the shared path maps
9. `Research Manager → Trader → Aggressive Analyst`; `Portfolio Manager → END`
10. **Return the uncompiled `workflow`** — the caller compiles

## Important: Message Clearing

Each analyst has a `Msg Clear {Label}` node (`create_msg_delete()`) that clears
message history between analysts. This prevents unbounded message accumulation
and keeps Anthropic happy (it requires at least one message) — the clearer adds a
placeholder `HumanMessage("Continue")`. Do not remove message clearers.

## Validation

```bash
python3 -c "
from tradingagents.graph.setup import GraphSetup
from tradingagents.graph.conditional_logic import ConditionalLogic
stub = {k: (lambda s: s) for k in ('market','social','news','fundamentals')}
wf = GraphSetup(None, None, stub, ConditionalLogic()).setup_graph(
    ('market','social','news','fundamentals'))
wf.compile()
print(sorted(wf.nodes))
"
pytest tests/test_analyst_execution.py tests/test_risk_router_path_map.py \
       tests/test_checkpoint_resume.py tests/test_market_toolnode.py -q
```

Expected node list (20 nodes for the default 4 analysts):

```
Aggressive Analyst, Bear Researcher, Bull Researcher, Conservative Analyst,
Fundamentals Analyst, Market Analyst, Msg Clear Fundamentals, Msg Clear Market,
Msg Clear News, Msg Clear Sentiment, Neutral Analyst, News Analyst,
Portfolio Manager, Research Manager, Sentiment Analyst, Trader,
tools_fundamentals, tools_market, tools_news, tools_social
```

Two gotchas in that snippet:

- **`GraphSetup` accepts `None` LLMs** — the agent factories only close over the
  LLM, and `bind_structured` catches the resulting `AttributeError` and logs
  "provider does not support with_structured_output". Four such warnings on stderr
  are expected here and are not failures.
- **Tool nodes may not be `None`** — LangGraph's `add_node` raises a bare
  `RuntimeError` for a non-callable, so pass a callable stub, not `None`.

Instantiating `TradingAgentsGraph()` **does** need an API key, since it constructs
real LLM clients. Use the `GraphSetup` snippet above for graph-shape checks.

## Additional Resources

- **`references/graph_structure.md`** — node/edge tables, state flow, tool-node contents
