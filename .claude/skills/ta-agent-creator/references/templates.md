# 에이전트 코드 템플릿

템플릿은 이 포크의 실제 코드를 그대로 반영한다. `{name}` / `{Stance}` 등은 알맞게
치환한다.

---

## 템플릿 1: 도구 사용 애널리스트 (산문 출력)

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

**`report`가 조건부인 이유**: 모델이 아직 도구를 호출하는 동안에는 도구 루프를 통해
노드가 다시 실행된다. `result.content`를 조건 없이 기록하면 "데이터를 확인해
보겠다" 같은 중간 턴이 리포트 필드에 들어간다.

**`{ticker}` 템플릿 변수는 없다** — 식별 정보는 `{instrument_context}`를 통해
전달된다.

### 통합 단계

1. `agent_states.py`의 `AgentState`에 `{name}_report` 추가
2. `graph/analyst_execution.py`의 `ANALYST_NODE_SPECS`에 `AnalystNodeSpec` 추가
   (`report_key="{name}_report"` 포함)
3. `graph/setup.py`의 `analyst_factories`에 팩토리 람다 추가
4. `conditional_logic.py`에 `should_continue_{key}` 추가. 스펙의 `tool_node` /
   `clear_node` 문자열과 정확히 같은 값을 반환할 것
5. `graph/trading_graph.py`의 `_create_tool_nodes()`에 ToolNode 추가
6. `agents/__init__.py`에서 export
7. `reporting.py::write_report_tree()`에 리포트 섹션 추가

---

## 템플릿 2: 선인출(pre-fetch) 애널리스트 (구조화 출력, 도구 루프 없음)

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

통합 단계는 템플릿 1과 같고, 여기에 `agents/schemas.py`의 스키마와 렌더러가
추가된다. `ANALYST_NODE_SPECS`의 `tools_{key}` 항목은 여전히 필요하다는 점에
유의한다(셋업 루프가 조건 없이 등록한다). 도달할 수 없더라도 `tools_social`처럼
실제 ToolNode를 지정할 것.

---

## 템플릿 3: 순수 대화형 리서처 (투자 토론)

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

**`argument`의 접두사는 동작에 관여한다** — `should_continue_debate`가
`current_response.startswith("Bull")`로 분기한다.

### 통합 단계

1. `agent_states.py`의 `InvestDebateState`에 `{name}_history` 추가
2. `Propagator.create_initial_state()`에서 0으로 초기화
3. `setup_graph()`에 노드를 등록하고 토론 엣지를 연결
4. `should_continue_debate()`와 `DEBATE_PATH_MAP`을 **함께** 갱신
5. `agents/__init__.py`에서 export

---

## 템플릿 4: 리스크 토론자

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

`should_continue_risk_analysis`가 `startswith`로 매칭하는 대상이 `latest_speaker`다.

### 통합 단계

1. `RiskDebateState`에 `{stance}_history`와 `current_{stance}_response` 추가
2. `Propagator.create_initial_state()`에서 둘 다 0으로 초기화
3. `setup_graph()`에 노드를 등록하고 조건부 엣지 루프에 추가
4. `should_continue_risk_analysis()`의 순환 로직과 `RISK_ANALYSIS_PATH_MAP`을
   **함께** 갱신
5. 종료 임계값 조정: 현재는 `count >= 3 * max_risk_discuss_rounds`로 3자 순환에
   하드코딩되어 있다 — 토론자가 4명이면 `4 *`가 필요하다
6. `agents/__init__.py`에서 export

---

## 템플릿 5: 구조화 의사결정 에이전트

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

심판(judge)은 `count`를 그대로 둔다 — 값을 증가시키면 라우터가 다시 토론으로
되돌아갈 수 있다.

### `agents/schemas.py`의 스키마

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

중요한 컨벤션 세 가지:

- **`Field(description=...)`은 프롬프트 텍스트다.** 이것이 모델의 출력 지시가 되며,
  그래서 프롬프트 본문에는 컨텍스트와 등급 판단 기준만 담는다.
- **선택적 숫자 필드에는 `_coerce_optional_float`가 필요하다.** 모델은 선택적 float
  필드에 `"None"`, `"N/A"`, `"TBD"`를 적어 넣는다. 검증기가 없으면 구조화 호출이
  예외를 던지고 에이전트는 조용히 자유 텍스트로 성능이 떨어진다(업스트림 #1058).
- **렌더링된 마크다운 헤더는 계약이다.** `reporting.py`, CLI 화면,
  `rating.parse_rating()`이 모두 이를 읽는다.

---

## 안티패턴

| 하지 말 것 | 이렇게 할 것 |
|---|---|
| `create_x(llm, memory)` | `create_x(llm)`; `state["past_context"]`를 읽는다 |
| `FinancialSituationMemory("x", config)` | `TradingMemoryLog` 하나만; `ta-memory-manager` 참고 |
| 식별 정보를 위해 프롬프트에 `state["company_of_interest"]` 사용 | `get_instrument_context_from_state(state)` |
| `{ticker}` 프롬프트 변수 | `{instrument_context}` |
| `get_language_instruction()` 없는 프롬프트 | 항상 덧붙인다 |
| 경로 맵 항목 없는 새 라우터 반환값 | `DEBATE_PATH_MAP` / `RISK_ANALYSIS_PATH_MAP` 갱신 |
| `setup.py`에 애널리스트 노드 이름 하드코딩 | `AnalystNodeSpec` 추가 |
| 구조화 에이전트에 `bind_tools` 사용 | 데이터 선인출 + `NO_EXTERNAL_TOOLS` |
| 노드 함수 안에서 `bind_structured` | 팩토리 생성 시점에 한 번만 |
