# Agent Code Templates

Templates mirror the real code in this fork. Replace `{name}` / `{Stance}` etc.

---

## Template 1: Tool-Using Analyst (prose output)

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from tradingagents.agents.utils.agent_utils import (
    get_instrument_context_from_state,
    get_language_instruction,
    tool_one,
    tool_two,
)


def create_{name}_analyst(llm):

    def {name}_analyst_node(state):
        current_date = state["trade_date"]
        instrument_context = get_instrument_context_from_state(state)
        asset_type = state.get("asset_type", "stock")
        asset_label = "company" if asset_type == "stock" else "asset"

        tools = [tool_one, tool_two]

        system_message = (
            f"You are a {{role}} analyst tasked with analyzing {{domain}} for this {asset_label}. "
            "Use the available tools: tool_one(ticker, start_date, end_date) for ..., "
            "tool_two(ticker) for .... "
            "Provide specific, actionable insights with supporting evidence. "
            "Do not claim exact figures unless directly supported by tool output."
            + " Make sure to append a Markdown table at the end of the report to organize"
              " key points in the report, organized and easy to read."
            + get_language_instruction()
        )

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a helpful AI assistant, collaborating with other assistants."
                    " Use the provided tools to progress towards answering the question."
                    " If you are unable to fully answer, that's OK; another assistant with different tools"
                    " will help where you left off. Execute what you can to make progress."
                    " If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable,"
                    " prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop."
                    " You have access to the following tools: {tool_names}."
                    " Today's date is {current_date}; treat it as 'now' for all analysis and tool-call date ranges."
                    " {instrument_context}\n"
                    "{system_message}",
                ),
                MessagesPlaceholder(variable_name="messages"),
            ]
        )

        prompt = prompt.partial(system_message=system_message)
        prompt = prompt.partial(tool_names=", ".join([tool.name for tool in tools]))
        prompt = prompt.partial(current_date=current_date)
        prompt = prompt.partial(instrument_context=instrument_context)

        chain = prompt | llm.bind_tools(tools)
        result = chain.invoke(state["messages"])

        report = ""
        if len(result.tool_calls) == 0:
            report = result.content

        return {
            "messages": [result],
            "{name}_report": report,
        }

    return {name}_analyst_node
```

**Why `report` is conditional**: while the model is still calling tools, the node
runs again via the tool loop. Writing `result.content` unconditionally would put a
partial "let me check the data" turn into the report field.

There is **no `{ticker}` template variable** — identity arrives through
`{instrument_context}`.

### Integration steps

1. Add `{name}_report` to `AgentState` in `agent_states.py`
2. Add an `AnalystNodeSpec` to `ANALYST_NODE_SPECS` in `graph/analyst_execution.py`
   (with `report_key="{name}_report"`)
3. Add the factory lambda to `analyst_factories` in `graph/setup.py`
4. Add `should_continue_{key}` to `conditional_logic.py`, returning the spec's exact
   `tool_node` / `clear_node` strings
5. Add the ToolNode to `_create_tool_nodes()` in `graph/trading_graph.py`
6. Export from `agents/__init__.py`
7. Add a report section to `reporting.py::write_report_tree()`

---

## Template 2: Pre-fetch Analyst (structured output, no tool loop)

```python
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from tradingagents.agents.schemas import {Name}Report, render_{name}_report
from tradingagents.agents.utils.agent_utils import (
    get_instrument_context_from_state,
    get_language_instruction,
    some_tool,
)
from tradingagents.agents.utils.structured import (
    NO_EXTERNAL_TOOLS,
    bind_structured,
    invoke_structured_or_freetext,
)
from tradingagents.dataflows.my_source import fetch_my_source


def create_{name}_analyst(llm):
    structured_llm = bind_structured(llm, {Name}Report, "{Name} Analyst")

    def {name}_analyst_node(state):
        ticker = state["company_of_interest"]
        end_date = state["trade_date"]
        instrument_context = get_instrument_context_from_state(state)

        # Pre-fetch. Each fetcher must degrade gracefully and return a string —
        # no exception may surface from here.
        block_a = some_tool.func(ticker, start_date, end_date)   # .func bypasses @tool
        block_b = fetch_my_source(ticker)

        system_message = _build_system_message(
            ticker=ticker, block_a=block_a, block_b=block_b,
        )

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a helpful AI assistant, collaborating with other assistants."
                    " If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable,"
                    " prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop."
                    " Today's date is {current_date}; treat it as 'now' for all analysis."
                    " {instrument_context}"
                    " " + NO_EXTERNAL_TOOLS +
                    "\n{system_message}",
                ),
                MessagesPlaceholder(variable_name="messages"),
            ]
        )
        prompt = prompt.partial(system_message=system_message)
        prompt = prompt.partial(current_date=end_date)
        prompt = prompt.partial(instrument_context=instrument_context)

        # Format to a concrete message list so the structured and free-text paths
        # receive identical input. No bind_tools — the data is already in the prompt.
        formatted_messages = prompt.format_messages(messages=state["messages"])

        report_text = invoke_structured_or_freetext(
            structured_llm, llm, formatted_messages,
            render_{name}_report, "{Name} Analyst",
        )

        return {
            "messages": [AIMessage(content=report_text)],
            "{name}_report": report_text,
        }

    return {name}_analyst_node


def _build_system_message(*, ticker: str, block_a: str, block_b: str) -> str:
    return f"""You are a ... analyst. Produce a report for {ticker} from the
sources already collected for you.

## Data sources (pre-fetched, in this prompt)

<start_of_a>
{block_a}
<end_of_a>

<start_of_b>
{block_b}
<end_of_b>

## How to analyze this data
1. ...
2. Be honest about data limits. If a source returned an "<unavailable>" placeholder,
   say so explicitly and lower your stated confidence.

## Output fields
- **field_one**: ...
- **narrative**: ...

{get_language_instruction()}"""
```

Same integration steps as Template 1, plus the schema and renderer in
`agents/schemas.py`. Note the `tools_{key}` entry in `ANALYST_NODE_SPECS` is still
required (the setup loop registers it unconditionally) — give it a real ToolNode even
if unreachable, as `tools_social` does.

---

## Template 3: Pure Chat Researcher (investment debate)

```python
from tradingagents.agents.utils.agent_utils import (
    get_instrument_context_from_state,
    get_language_instruction,
)


def create_{name}_researcher(llm):
    def {name}_node(state) -> dict:
        investment_debate_state = state["investment_debate_state"]
        history = investment_debate_state.get("history", "")
        {name}_history = investment_debate_state.get("{name}_history", "")
        current_response = investment_debate_state.get("current_response", "")

        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]
        instrument_context = get_instrument_context_from_state(state)

        asset_type = state.get("asset_type", "stock")
        target_label = "stock" if asset_type == "stock" else "asset"
        fundamentals_label = (
            "Company fundamentals report"
            if asset_type == "stock"
            else "Asset fundamentals report (may be unavailable for crypto)"
        )

        prompt = f"""You are a {{Role}} Analyst ... for the {target_label}.

Key points to focus on:
- ...
- Engagement: Present your argument conversationally, engaging directly with the
  opposing analyst's points rather than just listing data.

Resources available:
{instrument_context}
Market research report: {market_research_report}
Social media sentiment report: {sentiment_report}
Latest world affairs news: {news_report}
{fundamentals_label}: {fundamentals_report}
Conversation history of the debate: {history}
Last opposing argument: {current_response}
""" + get_language_instruction()

        response = llm.invoke(prompt)
        argument = f"{{Role}} Analyst: {response.content}"

        new_investment_debate_state = {
            "history": history + "\n" + argument,
            "{name}_history": {name}_history + "\n" + argument,
            "{other}_history": investment_debate_state.get("{other}_history", ""),
            "current_response": argument,
            "count": investment_debate_state["count"] + 1,
        }

        return {"investment_debate_state": new_investment_debate_state}

    return {name}_node
```

**The `argument` prefix is load-bearing** — `should_continue_debate` dispatches on
`current_response.startswith("Bull")`.

### Integration steps

1. Add `{name}_history` to `InvestDebateState` in `agent_states.py`
2. Zero-init it in `Propagator.create_initial_state()`
3. Register the node in `setup_graph()` and wire the debate edges
4. Update `should_continue_debate()` **and** `DEBATE_PATH_MAP`
5. Export from `agents/__init__.py`

---

## Template 4: Risk Debator

```python
def create_{stance}_debator(llm):
    def {stance}_node(state) -> dict:
        risk_debate_state = state["risk_debate_state"]
        history = risk_debate_state.get("history", "")
        {stance}_history = risk_debate_state.get("{stance}_history", "")

        current_other1_response = risk_debate_state.get("current_{other1}_response", "")
        current_other2_response = risk_debate_state.get("current_{other2}_response", "")

        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]
        instrument_context = get_instrument_context_from_state(state)
        trader_decision = state["trader_investment_plan"]

        prompt = f"""As the {{Stance}} Risk Analyst, your role is to ...
Here is the trader's decision:

{trader_decision}

Incorporate insights from the following sources into your arguments:

{instrument_context}
Market Research Report: {market_research_report}
Social Media Sentiment Report: {sentiment_report}
Latest World Affairs Report: {news_report}
Company Fundamentals Report: {fundamentals_report}
Here is the current conversation history: {history} Here are the last arguments from
the other analysts: {current_other1_response} {current_other2_response}. If there are
no responses from the other viewpoints yet, present your own argument based on the
available data.

Output conversationally as if you are speaking without any special formatting.""" \
            + get_language_instruction()

        response = llm.invoke(prompt)
        argument = f"{{Stance}} Analyst: {response.content}"

        new_risk_debate_state = {
            "history": history + "\n" + argument,
            "{stance}_history": {stance}_history + "\n" + argument,
            "{other1}_history": risk_debate_state.get("{other1}_history", ""),
            "{other2}_history": risk_debate_state.get("{other2}_history", ""),
            "latest_speaker": "{Stance}",
            "current_{stance}_response": argument,
            "current_{other1}_response": risk_debate_state.get("current_{other1}_response", ""),
            "current_{other2}_response": risk_debate_state.get("current_{other2}_response", ""),
            "count": risk_debate_state["count"] + 1,
        }

        return {"risk_debate_state": new_risk_debate_state}

    return {stance}_node
```

`latest_speaker` is what `should_continue_risk_analysis` matches with `startswith`.

### Integration steps

1. Add `{stance}_history` and `current_{stance}_response` to `RiskDebateState`
2. Zero-init both in `Propagator.create_initial_state()`
3. Register the node in `setup_graph()` and add it to the conditional-edge loop
4. Update `should_continue_risk_analysis()` rotation **and** `RISK_ANALYSIS_PATH_MAP`
5. Adjust the exit threshold: it is currently `count >= 3 * max_risk_discuss_rounds`,
   hardcoded to a 3-way rotation — a 4th debator needs `4 *`
6. Export from `agents/__init__.py`

---

## Template 5: Structured Decision Agent

```python
from tradingagents.agents.schemas import {Name}Decision, render_{name}_decision
from tradingagents.agents.utils.agent_utils import (
    get_instrument_context_from_state,
    get_language_instruction,
)
from tradingagents.agents.utils.structured import (
    NO_EXTERNAL_TOOLS,
    bind_structured,
    invoke_structured_or_freetext,
)


def create_{name}_manager(llm):
    structured_llm = bind_structured(llm, {Name}Decision, "{Name} Manager")

    def {name}_manager_node(state) -> dict:
        instrument_context = get_instrument_context_from_state(state)
        debate_state = state["{debate_type}_debate_state"]
        history = debate_state["history"]

        past_context = state.get("past_context", "")
        lessons_line = (
            f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
            if past_context
            else ""
        )

        prompt = f"""As the {{Role}}, synthesize the debate and deliver ...

{instrument_context}

---

**Rating Scale** (use exactly one):
- **Buy**: ...
- **Overweight**: ...
- **Hold**: ...
- **Underweight**: ...
- **Sell**: ...

**Context:**
{lessons_line}
**Debate History:**
{history}

---

Be decisive and ground every conclusion in specific evidence from the analysts.

{NO_EXTERNAL_TOOLS}{get_language_instruction()}"""

        decision = invoke_structured_or_freetext(
            structured_llm, llm, prompt, render_{name}_decision, "{Name} Manager",
        )

        new_debate_state = {
            **debate_state,               # carry every sibling field
            "judge_decision": decision,
            "latest_speaker": "Judge",    # risk debate only
            "count": debate_state["count"],   # judges do NOT increment
        }

        return {
            "{debate_type}_debate_state": new_debate_state,
            "{output_field}": decision,
        }

    return {name}_manager_node
```

Judges keep `count` unchanged — incrementing it would let the router bounce back
into the debate.

### The schema in `agents/schemas.py`

```python
class {Name}Decision(BaseModel):
    """Docstring — describes the agent's job; the model reads it."""

    rating: PortfolioRating = Field(
        description=(
            "The final rating. Exactly one of Buy / Overweight / Hold / "
            "Underweight / Sell, picked based on the analysts' debate."
        ),
    )
    summary: str = Field(description="Two to four sentences covering ...")
    price_target: float | None = Field(
        default=None, description="Optional target price in the quote currency.",
    )

    @field_validator("price_target", mode="before")
    @classmethod
    def _nullish_float_to_none(cls, v):
        return _coerce_optional_float(v)


def render_{name}_decision(d: {Name}Decision) -> str:
    parts = [f"**Rating**: {d.rating.value}", "", f"**Summary**: {d.summary}"]
    if d.price_target is not None:
        parts.extend(["", f"**Price Target**: {d.price_target}"])
    return "\n".join(parts)
```

Three conventions that matter:

- **`Field(description=...)` is prompt text.** It becomes the model's output
  instruction, which is why the prompt body only carries context and rating guidance.
- **Optional numeric fields need `_coerce_optional_float`.** Models write `"None"`,
  `"N/A"`, `"TBD"` into optional float fields; without the validator the structured
  call raises and the agent silently degrades to free text (upstream #1058).
- **The rendered markdown headers are a contract.** `reporting.py`, the CLI display,
  and `rating.parse_rating()` all read them.

---

## Anti-patterns

| Don't | Do |
|---|---|
| `create_x(llm, memory)` | `create_x(llm)`; read `state["past_context"]` |
| `FinancialSituationMemory("x", config)` | one `TradingMemoryLog`; see `ta-memory-manager` |
| `state["company_of_interest"]` in a prompt for identity | `get_instrument_context_from_state(state)` |
| `{ticker}` prompt variable | `{instrument_context}` |
| prompt without `get_language_instruction()` | always append it |
| new router return without a path-map entry | update `DEBATE_PATH_MAP` / `RISK_ANALYSIS_PATH_MAP` |
| hardcode the analyst node name in `setup.py` | add an `AnalystNodeSpec` |
| `bind_tools` on a structured agent | pre-fetch data + `NO_EXTERNAL_TOOLS` |
| `bind_structured` inside the node function | at factory creation, once |
