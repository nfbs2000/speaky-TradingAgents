# Graph Structure Reference

## Node Registry

### Analyst Nodes (per selected analyst, from `ANALYST_NODE_SPECS`)

| key | agent_node | clear_node | tool_node | report_key |
|-----|-----------|-----------|-----------|------------|
| `market` | `Market Analyst` | `Msg Clear Market` | `tools_market` | `market_report` |
| `social` | `Sentiment Analyst` | `Msg Clear Sentiment` | `tools_social` | `sentiment_report` |
| `news` | `News Analyst` | `Msg Clear News` | `tools_news` | `news_report` |
| `fundamentals` | `Fundamentals Analyst` | `Msg Clear Fundamentals` | `tools_fundamentals` | `fundamentals_report` |

Factories (all take `quick_thinking_llm`):

| agent_node | factory |
|-----------|---------|
| `Market Analyst` | `create_market_analyst(llm)` |
| `Sentiment Analyst` | `create_sentiment_analyst(llm)` |
| `News Analyst` | `create_news_analyst(llm)` |
| `Fundamentals Analyst` | `create_fundamentals_analyst(llm)` |
| `Msg Clear *` | `create_msg_delete()` |

### Fixed Nodes

| Node Name | Factory | LLM | Connected To |
|-----------|---------|-----|--------------|
| `Bull Researcher` | `create_bull_researcher(llm)` | quick | conditional (DEBATE_PATH_MAP) |
| `Bear Researcher` | `create_bear_researcher(llm)` | quick | conditional (DEBATE_PATH_MAP) |
| `Research Manager` | `create_research_manager(llm)` | **deep** | → `Trader` |
| `Trader` | `create_trader(llm)` | quick | → `Aggressive Analyst` |
| `Aggressive Analyst` | `create_aggressive_debator(llm)` | quick | conditional (RISK_ANALYSIS_PATH_MAP) |
| `Conservative Analyst` | `create_conservative_debator(llm)` | quick | conditional (RISK_ANALYSIS_PATH_MAP) |
| `Neutral Analyst` | `create_neutral_debator(llm)` | quick | conditional (RISK_ANALYSIS_PATH_MAP) |
| `Portfolio Manager` | `create_portfolio_manager(llm)` | **deep** | → `END` |

**No factory takes a memory argument.** Memory in this fork is a single markdown log
read once at run start into `state["past_context"]`, not per-agent BM25 stores.

## Edge Map

### Sequential Analyst Chain
```
START → specs[0].agent_node
specs[i].agent_node → [conditional should_continue_{key}] → specs[i].tool_node | specs[i].clear_node
specs[i].tool_node  → specs[i].agent_node                         (loop)
specs[i].clear_node → specs[i+1].agent_node                       (or Bull Researcher if last)
```

The conditional edge is declared with a **target list** `[current_tools, current_clear]`
(analyst tool loops only ever return those two).

### Investment Debate
```
(last clear_node) → Bull Researcher
Bull Researcher → [should_continue_debate, DEBATE_PATH_MAP]
Bear Researcher → [should_continue_debate, DEBATE_PATH_MAP]
```

`DEBATE_PATH_MAP` = `{Bull Researcher, Bear Researcher, Research Manager}` — both
edges map all three so a fall-through return cannot crash the run (#1088).

Alternation: exit to `Research Manager` when `count >= 2 * max_debate_rounds`;
otherwise `current_response.startswith("Bull")` → Bear, else Bull.

### Post-Debate
```
Research Manager → Trader
Trader → Aggressive Analyst
```

### Risk Debate (3-way rotation)
```
Aggressive Analyst   → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Conservative Analyst → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Neutral Analyst      → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Portfolio Manager    → END
```

`RISK_ANALYSIS_PATH_MAP` = `{Aggressive Analyst, Conservative Analyst,
Neutral Analyst, Portfolio Manager}`.

Rotation: exit to `Portfolio Manager` when `count >= 3 * max_risk_discuss_rounds`;
otherwise `latest_speaker.startswith("Aggressive")` → Conservative,
`startswith("Conservative")` → Neutral, else Aggressive.

## ConditionalLogic Methods

```python
class ConditionalLogic:
    def __init__(self, max_debate_rounds=1, max_risk_discuss_rounds=1)

    # Analyst tool loops — resolved by getattr(logic, f"should_continue_{spec.key}")
    def should_continue_market(state)       -> "tools_market"       | "Msg Clear Market"
    def should_continue_social(state)       -> "tools_social"       | "Msg Clear Sentiment"
    def should_continue_news(state)         -> "tools_news"         | "Msg Clear News"
    def should_continue_fundamentals(state) -> "tools_fundamentals" | "Msg Clear Fundamentals"

    def should_continue_debate(state)        -> "Bear Researcher" | "Bull Researcher" | "Research Manager"
    def should_continue_risk_analysis(state) -> "Conservative Analyst" | "Neutral Analyst"
                                              | "Aggressive Analyst" | "Portfolio Manager"
```

Note the asymmetry: the method name suffix is the **wire key** (`social`) while the
returned clear-node label is the **display name** (`Msg Clear Sentiment`).

## State Flow Through Graph

```
START (from Propagator.create_initial_state):
  messages=[("human", ticker)], company_of_interest, asset_type,
  instrument_context, trade_date, past_context,
  investment_debate_state (zeroed), risk_debate_state (zeroed),
  market_report="", sentiment_report="", news_report="", fundamentals_report=""

After Analysts:
  market_report, sentiment_report, news_report, fundamentals_report

After Investment Debate:
  investment_debate_state.{bull_history, bear_history, history, current_response,
                           judge_decision, count}
  investment_plan

After Trader:
  trader_investment_plan, sender

After Risk Debate:
  risk_debate_state.{aggressive_history, conservative_history, neutral_history,
                     history, latest_speaker, current_*_response,
                     judge_decision, count}
  final_trade_decision

END: final_trade_decision holds the rendered PortfolioDecision markdown
```

`AgentState` extends `MessagesState`, so `messages` is reducer-managed. All other
fields are last-write-wins.

Fields not present in the upstream base version: `asset_type`,
`instrument_context`, `past_context`.

## Config Parameters Affecting Workflow

```python
"max_debate_rounds": 1,        # investment debate turns = 2 × this
"max_risk_discuss_rounds": 1,  # risk debate turns = 3 × this
"max_recur_limit": 100,        # LangGraph recursion_limit, set by Propagator
"checkpoint_enabled": False,   # recompile with SqliteSaver, resume on crash
```

`Propagator.get_graph_args()` returns
`{"stream_mode": "values", "config": {"recursion_limit": max_recur_limit}}`.

## Tool Nodes

Created in `TradingAgentsGraph._create_tool_nodes()`:

```python
"market":       ToolNode([get_stock_data, get_indicators, get_verified_market_snapshot])
"social":       ToolNode([get_news])          # registered but unreachable — analyst binds no tools
"news":         ToolNode([get_news, get_global_news, get_insider_transactions,
                          get_macro_indicators, get_prediction_markets])
"fundamentals": ToolNode([get_fundamentals, get_balance_sheet, get_cashflow,
                          get_income_statement])
```

`get_verified_market_snapshot` **must** stay in the market tool node: the market
analyst's prompt requires calling it, and if it is not executable the call fails and
the model reports the data "unavailable".

The news analyst's prompt does not mention `get_insider_transactions` (the
fundamentals side uses insider data conceptually), but the tool is bound in the
news node — leaving an extra bound tool is harmless.

## Analyst Wall-Time Tracking

`AnalystWallTimeTracker(plan)` in `graph/analyst_execution.py` powers the CLI's
per-analyst timing display. `sync_analyst_tracker_from_chunk(tracker, chunk)` infers
progress from which `report_key`s are populated in a streamed chunk: any spec with a
non-empty report is marked started+completed, and the first spec without one is
marked started. If you add an analyst, its `report_key` in `ANALYST_NODE_SPECS`
must match the state field the node writes, or timing silently stops advancing.

## Checkpoint Signature

```python
def _run_signature(self, asset_type):
    return "|".join([
        "analysts=" + ",".join(self.selected_analysts),
        f"debate={self.config['max_debate_rounds']}",
        f"risk={self.config['max_risk_discuss_rounds']}",
        f"asset={asset_type}",
    ])
```

Keyed into `thread_id(ticker, date, signature)`. Any graph-shape change starts a
fresh run instead of resuming an incompatible checkpoint (#1089). If you add a
config knob that changes graph shape, add it here.
