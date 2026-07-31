---
name: ta-agent-creator
description: This skill should be used when the user asks to "add new agent", "create agent", "add analyst", "add researcher", "add debator", "new trading agent", "add options analyst", "create crypto analyst", "add new risk debator", "add structured agent", or wants to extend TradingAgents with a new agent following project conventions.
version: 0.2.0
---

# TradingAgents Agent Creator

Create new agents for the TradingAgents multi-agent system following the
conventions actually used in `tradingagents/`.

## Five Agent Categories

### Category 1: Tool-Using Analyst (prose output)
- **Signature**: `create_*_analyst(llm)` → node function
- **Uses**: `ChatPromptTemplate` + `MessagesPlaceholder` + `llm.bind_tools(tools)`
- **Output**: `{"messages": [result], "{name}_report": report}` where `report` is
  set only when `len(result.tool_calls) == 0`
- **Examples**: market, news, fundamentals
- **LLM**: `quick_thinking_llm`

### Category 2: Pre-fetch Analyst (structured output, no tool loop)
- **Signature**: `create_*_analyst(llm)` → node function
- **Uses**: fetch data eagerly → inject into prompt → `invoke_structured_or_freetext`
- **Output**: `{"messages": [AIMessage(content=text)], "{name}_report": text}`
- **Example**: sentiment analyst
- **Pick this over Category 1** when the data sources are known up front and you want
  a deterministic report header. It removes a round trip and eliminates the class of
  hallucination where the model invents data a tool never returned.

### Category 3: Pure Chat Researcher / Debator
- **Signature**: `create_*_researcher(llm)` / `create_*_debator(llm)` → node function
- **Uses**: f-string prompt + `llm.invoke(prompt)`
- **Output**: updates `investment_debate_state` or `risk_debate_state`
- **Examples**: bull, bear, aggressive, conservative, neutral
- **LLM**: `quick_thinking_llm`
- **No memory argument.** Upstream's `create_bull_researcher(llm, memory)` signature
  does not exist here.

### Category 4: Structured Decision Agent
- **Signature**: `create_*_manager(llm)` / `create_trader(llm)` → node function
- **Uses**: `bind_structured(llm, Schema, name)` at creation +
  `invoke_structured_or_freetext(...)` at invocation
- **Output**: writes rendered markdown to a state field
- **Examples**: research_manager, trader, portfolio_manager
- **LLM**: `deep_thinking_llm` for managers, `quick_thinking_llm` for the trader

### Category 5: Message Clearer
`create_msg_delete()` in `agents/utils/agent_utils.py` — one per analyst, already
handled generically by the setup loop. You never write a new one.

## Agent Creation Checklist

### Step 1 — Create the agent file

`tradingagents/agents/{category}/{agent_name}.py`, using the matching template from
`references/templates.md`.

Always end user-visible prompt text with `+ get_language_instruction()`, or
`tests/test_i18n_coverage.py` fails and non-English runs produce mixed-language
reports.

Read ticker identity from `get_instrument_context_from_state(state)` — **not** from
`state["company_of_interest"]` directly, and there is no `{ticker}` prompt variable.

### Step 2 — Export from `agents/__init__.py`

Add both the import and the `__all__` entry:

```python
from .{category}.{agent_name} import create_{agent_name}
```

### Step 3 — Add state fields (if the agent produces new output)

In `agents/utils/agent_states.py`:

```python
class AgentState(MessagesState):
    # ...
    new_report: Annotated[str, "Description of the new report"]
```

For a new debate, add a `TypedDict` following `InvestDebateState` /
`RiskDebateState`, and initialize it in `Propagator.create_initial_state()` —
**a debate state that is not zeroed there raises `KeyError` on the first
`count + 1`.**

### Step 4a — For a new analyst: register in the node-spec table

Analyst node names live in `graph/analyst_execution.py::ANALYST_NODE_SPECS`, not as
literals in `setup.py`:

```python
"options": AnalystNodeSpec(
    key="options",                       # the wire value used in selected_analysts
    agent_node="Options Analyst",
    clear_node="Msg Clear Options",
    tool_node="tools_options",
    report_key="options_report",         # must match the state field the node writes
),
```

Then add one lambda to `analyst_factories` in `GraphSetup.setup_graph()`:

```python
"options": lambda: create_options_analyst(self.quick_thinking_llm),
```

The setup loop handles nodes and edges from there. `report_key` must match the state
field or the CLI's wall-time tracker silently stops advancing.

### Step 4b — For any other agent: register the node in `setup.py`

```python
workflow.add_node("Agent Name", agent_node)
workflow.add_edge("Previous Node", "Agent Name")
workflow.add_edge("Agent Name", "Next Node")
```

### Step 5 — Add routing logic

In `graph/conditional_logic.py`.

For a tool-using analyst, the method name must be `should_continue_{spec.key}`
(the setup loop resolves it with `getattr`), and it must return the spec's exact
`tool_node` / `clear_node` strings:

```python
def should_continue_options(self, state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools_options"
    return "Msg Clear Options"
```

For a debate participant, extend `should_continue_debate` or
`should_continue_risk_analysis` — **and add every new return value to
`DEBATE_PATH_MAP` / `RISK_ANALYSIS_PATH_MAP` in `setup.py`.** A router return
missing from the shared path map crashes LangGraph mid-run (upstream #1088);
`tests/test_risk_router_path_map.py` guards this.

### Step 6 — Add a tool node (tool-using agents only)

In `graph/trading_graph.py::_create_tool_nodes()`:

```python
"options": ToolNode([get_options_chain, get_implied_volatility]),
```

Every tool bound via `bind_tools` must also be in the ToolNode, or the call fails at
execution and the model reports the data "unavailable".

### Step 7 — Optional additions

- **Structured output**: add the schema + a `render_*` helper to
  `agents/schemas.py`; go through `agents/utils/structured.py`.
- **Memory context**: `state["past_context"]` already exists — just read it (see the
  `ta-memory-manager` skill). Do **not** create a new memory instance; there is one
  `TradingMemoryLog`, not per-agent stores.
- **Config parameters**: add to `default_config.py`, plus an `_ENV_OVERRIDES` row if
  it should be env-settable.
- **Report output**: add a section to `reporting.py::write_report_tree()` so the new
  report reaches `complete_report.md` and the CLI display.
- **Checkpoint signature**: if the agent's presence changes graph shape, add it to
  `TradingAgentsGraph._run_signature()`.

## File Modification Summary

| Step | File | Action |
|------|------|--------|
| 1 | `agents/{category}/{name}.py` | create |
| 2 | `agents/__init__.py` | import + `__all__` |
| 3 | `agents/utils/agent_states.py` | state fields |
| 3 | `graph/propagation.py` | zero-init any new debate state |
| 4a | `graph/analyst_execution.py` | `ANALYST_NODE_SPECS` entry (analysts) |
| 4a/b | `graph/setup.py` | factory lambda, or node + edges |
| 5 | `graph/conditional_logic.py` | router method |
| 5 | `graph/setup.py` | path-map entries for new router returns |
| 6 | `graph/trading_graph.py` | `_create_tool_nodes()` |
| 7 | `agents/schemas.py` | schema + renderer (structured agents) |
| 7 | `tradingagents/reporting.py` | report section |
| 7 | `default_config.py` | config keys |

## Conventions Worth Copying

- **Factory closure, not a class.** `create_x(llm)` returns the node function;
  expensive setup (like `bind_structured`) happens once at creation, outside the node.
- **Crypto-aware labels.** Read `state.get("asset_type", "stock")` and vary wording
  (`"stock"` vs `"asset"`, and a fundamentals label noting data may be unavailable
  for crypto) — see `bull_researcher.py`.
- **Preserve sibling history fields.** When returning a debate state, carry over the
  other participants' `*_history` and `current_*_response` values; a partial dict
  drops them.
- **Speaker prefixes are load-bearing.** `f"Bull Analyst: {content}"` and
  `latest_speaker = "Aggressive"` are what the routers match on with `startswith`.
- **Structured agents get `NO_EXTERNAL_TOOLS`.** Schema-only structured output binds
  exactly one tool, so a model reaching for search emits an unknown tool call and the
  whole structured attempt is discarded (upstream #1130). Import it from
  `agents/utils/structured.py`.

## Validation

```bash
python3 -c "
from tradingagents.graph.setup import GraphSetup
from tradingagents.graph.conditional_logic import ConditionalLogic
from tradingagents.graph.analyst_execution import ANALYST_NODE_SPECS
keys = tuple(ANALYST_NODE_SPECS)
stub = {k: (lambda s: s) for k in keys}
wf = GraphSetup(None, None, stub, ConditionalLogic()).setup_graph(keys)
wf.compile()
print(len(wf.nodes), 'nodes'); print(sorted(wf.nodes))
"
pytest tests/test_analyst_execution.py tests/test_risk_router_path_map.py \
       tests/test_structured_agents.py tests/test_i18n_coverage.py \
       tests/test_reporting.py -q
```

`GraphSetup` accepts `None` LLMs (the factories only close over them; `bind_structured`
catches the resulting `AttributeError` and logs a fallback warning — those warnings
are expected here). Tool-node values must be callables, not `None` — LangGraph's
`add_node` raises a bare `RuntimeError` otherwise.

## Additional Resources

- **`references/templates.md`** — copy-paste templates for all four writable
  categories, matching the code in this fork
