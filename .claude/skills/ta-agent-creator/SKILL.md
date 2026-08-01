---
name: ta-agent-creator
description: 사용자가 "add new agent", "create agent", "add analyst", "add researcher", "add debator", "new trading agent", "add options analyst", "create crypto analyst", "add new risk debator", "add structured agent"를 요청하거나, 프로젝트 컨벤션에 맞춰 TradingAgents에 새 에이전트를 추가하려 할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents Agent Creator

`tradingagents/`에서 실제로 사용 중인 컨벤션에 따라 TradingAgents 멀티 에이전트
시스템에 새 에이전트를 만든다.

## 5가지 에이전트 범주

### 범주 1: 도구 사용 애널리스트 (산문 출력)
- **시그니처**: `create_*_analyst(llm)` → 노드 함수
- **사용**: `ChatPromptTemplate` + `MessagesPlaceholder` + `llm.bind_tools(tools)`
- **출력**: `{"messages": [result], "{name}_report": report}`. 여기서 `report`는
  `len(result.tool_calls) == 0`일 때만 설정된다
- **예시**: market, news, fundamentals
- **LLM**: `quick_thinking_llm`

### 범주 2: 선인출(pre-fetch) 애널리스트 (구조화 출력, 도구 루프 없음)
- **시그니처**: `create_*_analyst(llm)` → 노드 함수
- **사용**: 데이터를 미리 가져옴 → 프롬프트에 주입 → `invoke_structured_or_freetext`
- **출력**: `{"messages": [AIMessage(content=text)], "{name}_report": text}`
- **예시**: sentiment analyst
- **범주 1 대신 이것을 선택할 때**: 데이터 소스를 미리 알고 있고 결정적인 리포트
  헤더를 원하는 경우. 왕복 호출이 하나 줄고, 도구가 반환한 적 없는 데이터를 모델이
  지어내는 종류의 환각이 사라진다.

### 범주 3: 순수 대화형 리서처 / 토론자
- **시그니처**: `create_*_researcher(llm)` / `create_*_debator(llm)` → 노드 함수
- **사용**: f-string 프롬프트 + `llm.invoke(prompt)`
- **출력**: `investment_debate_state` 또는 `risk_debate_state`를 갱신
- **예시**: bull, bear, aggressive, conservative, neutral
- **LLM**: `quick_thinking_llm`
- **memory 인자 없음.** 업스트림의 `create_bull_researcher(llm, memory)` 시그니처는
  여기에 존재하지 않는다.

### 범주 4: 구조화 의사결정 에이전트
- **시그니처**: `create_*_manager(llm)` / `create_trader(llm)` → 노드 함수
- **사용**: 생성 시점에 `bind_structured(llm, Schema, name)` +
  호출 시점에 `invoke_structured_or_freetext(...)`
- **출력**: 렌더링된 마크다운을 상태 필드에 기록
- **예시**: research_manager, trader, portfolio_manager
- **LLM**: 매니저는 `deep_thinking_llm`, 트레이더는 `quick_thinking_llm`

### 범주 5: 메시지 클리어러
`agents/utils/agent_utils.py`의 `create_msg_delete()` — 애널리스트마다 하나씩이며,
셋업 루프가 이미 일반적으로 처리한다. 새로 작성할 일은 없다.

## 에이전트 생성 체크리스트

### 1단계 — 에이전트 파일 생성

`references/templates.md`에서 해당하는 템플릿을 사용해
`tradingagents/agents/{category}/{agent_name}.py`를 만든다.

사용자에게 보이는 프롬프트 텍스트는 항상 `+ get_language_instruction()`으로 끝내야
한다. 그러지 않으면 `tests/test_i18n_coverage.py`가 실패하고, 영어가 아닌 실행에서
언어가 섞인 리포트가 나온다.

티커 식별 정보는 `get_instrument_context_from_state(state)`에서 읽는다 —
`state["company_of_interest"]`를 직접 쓰면 **안 되고**, `{ticker}` 프롬프트 변수는
존재하지 않는다.

### 2단계 — `agents/__init__.py`에서 export

import와 `__all__` 항목을 모두 추가한다:

```python
from .{category}.{agent_name} import create_{agent_name}
```

### 3단계 — 상태 필드 추가 (에이전트가 새 출력을 생성하는 경우)

`agents/utils/agent_states.py`에서:

```python
class AgentState(MessagesState):
    # ...
    new_report: Annotated[str, "Description of the new report"]
```

새 토론을 추가한다면 `InvestDebateState` / `RiskDebateState`를 따라 `TypedDict`를
추가하고, `Propagator.create_initial_state()`에서 초기화한다 —
**거기서 0으로 초기화되지 않은 토론 상태는 첫 `count + 1`에서 `KeyError`를
발생시킨다.**

### 4a단계 — 새 애널리스트인 경우: 노드 스펙 테이블에 등록

애널리스트 노드 이름은 `setup.py`의 리터럴이 아니라
`graph/analyst_execution.py::ANALYST_NODE_SPECS`에 있다:

```python
"options": AnalystNodeSpec(
    key="options",                       # the wire value used in selected_analysts
    agent_node="Options Analyst",
    clear_node="Msg Clear Options",
    tool_node="tools_options",
    report_key="options_report",         # must match the state field the node writes
),
```

그다음 `GraphSetup.setup_graph()`의 `analyst_factories`에 람다 하나를 추가한다:

```python
"options": lambda: create_options_analyst(self.quick_thinking_llm),
```

이후 노드와 엣지는 셋업 루프가 처리한다. `report_key`는 상태 필드와 일치해야 하며,
그렇지 않으면 CLI의 실행 시간 추적기가 조용히 진행을 멈춘다.

### 4b단계 — 그 외 에이전트인 경우: `setup.py`에 노드 등록

```python
workflow.add_node("Agent Name", agent_node)
workflow.add_edge("Previous Node", "Agent Name")
workflow.add_edge("Agent Name", "Next Node")
```

### 5단계 — 라우팅 로직 추가

`graph/conditional_logic.py`에서 작업한다.

도구 사용 애널리스트라면 메서드 이름은 반드시 `should_continue_{spec.key}`여야 하고
(셋업 루프가 `getattr`로 찾는다), 스펙의 `tool_node` / `clear_node` 문자열과 정확히
같은 값을 반환해야 한다:

```python
def should_continue_options(self, state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools_options"
    return "Msg Clear Options"
```

토론 참여자라면 `should_continue_debate` 또는 `should_continue_risk_analysis`를
확장하고, **새 반환값을 모두 `setup.py`의 `DEBATE_PATH_MAP` /
`RISK_ANALYSIS_PATH_MAP`에 추가한다.** 공유 경로 맵에 없는 라우터 반환값은 실행
도중 LangGraph를 크래시시킨다(업스트림 #1088).
`tests/test_risk_router_path_map.py`가 이를 방어한다.

### 6단계 — 도구 노드 추가 (도구 사용 에이전트만)

`graph/trading_graph.py::_create_tool_nodes()`에서:

```python
"options": ToolNode([get_options_chain, get_implied_volatility]),
```

`bind_tools`로 바인딩한 모든 도구는 ToolNode에도 있어야 한다. 그렇지 않으면 실행
시점에 호출이 실패하고 모델은 데이터가 "사용 불가"라고 보고한다.

### 7단계 — 선택적 추가 작업

- **구조화 출력**: `agents/schemas.py`에 스키마와 `render_*` 헬퍼를 추가하고,
  `agents/utils/structured.py`를 거쳐 처리한다.
- **메모리 컨텍스트**: `state["past_context"]`가 이미 존재하므로 읽기만 하면 된다
  (`ta-memory-manager` 스킬 참고). 새 메모리 인스턴스를 만들지 **말 것**.
  에이전트별 저장소가 아니라 단일 `TradingMemoryLog` 하나만 존재한다.
- **설정 파라미터**: `default_config.py`에 추가하고, 환경 변수로 설정 가능해야 한다면
  `_ENV_OVERRIDES` 항목도 추가한다.
- **리포트 출력**: `reporting.py::write_report_tree()`에 섹션을 추가해 새 리포트가
  `complete_report.md`와 CLI 화면에 도달하도록 한다.
- **체크포인트 시그니처**: 에이전트의 존재 여부가 그래프 형태를 바꾼다면
  `TradingAgentsGraph._run_signature()`에 추가한다.

## 파일 수정 요약

| 단계 | 파일 | 작업 |
|------|------|------|
| 1 | `agents/{category}/{name}.py` | 생성 |
| 2 | `agents/__init__.py` | import + `__all__` |
| 3 | `agents/utils/agent_states.py` | 상태 필드 |
| 3 | `graph/propagation.py` | 새 토론 상태 0 초기화 |
| 4a | `graph/analyst_execution.py` | `ANALYST_NODE_SPECS` 항목 (애널리스트) |
| 4a/b | `graph/setup.py` | 팩토리 람다, 또는 노드 + 엣지 |
| 5 | `graph/conditional_logic.py` | 라우터 메서드 |
| 5 | `graph/setup.py` | 새 라우터 반환값에 대한 경로 맵 항목 |
| 6 | `graph/trading_graph.py` | `_create_tool_nodes()` |
| 7 | `agents/schemas.py` | 스키마 + 렌더러 (구조화 에이전트) |
| 7 | `tradingagents/reporting.py` | 리포트 섹션 |
| 7 | `default_config.py` | 설정 키 |

## 따라 할 만한 컨벤션

- **클래스가 아니라 팩토리 클로저.** `create_x(llm)`이 노드 함수를 반환하며,
  비용이 큰 셋업(`bind_structured` 등)은 노드 바깥에서 생성 시점에 한 번만 수행된다.
- **암호화폐를 고려한 레이블.** `state.get("asset_type", "stock")`을 읽어 표현을
  바꾼다(`"stock"` 대 `"asset"`, 그리고 암호화폐에서는 데이터가 없을 수 있음을
  알리는 펀더멘털 레이블) — `bull_researcher.py` 참고.
- **형제 히스토리 필드를 보존할 것.** 토론 상태를 반환할 때 다른 참여자의
  `*_history`와 `current_*_response` 값을 함께 넘긴다. 일부만 담은 dict는 그 값들을
  누락시킨다.
- **화자 접두사는 동작에 관여한다.** `f"Bull Analyst: {content}"`와
  `latest_speaker = "Aggressive"`는 라우터가 `startswith`로 매칭하는 대상이다.
- **구조화 에이전트에는 `NO_EXTERNAL_TOOLS`를 넣는다.** 스키마 전용 구조화 출력은
  도구를 정확히 하나만 바인딩하므로, 모델이 검색을 시도하면 알 수 없는 도구 호출이
  발생하고 구조화 시도 전체가 폐기된다(업스트림 #1130).
  `agents/utils/structured.py`에서 import한다.

## 검증

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

`GraphSetup`은 `None` LLM을 허용한다(팩토리는 LLM을 클로저로 담기만 하며,
`bind_structured`가 그로 인해 발생하는 `AttributeError`를 잡아 폴백 경고를 남긴다 —
여기서 그 경고는 정상이다). 도구 노드 값은 `None`이 아니라 호출 가능 객체여야 한다.
그렇지 않으면 LangGraph의 `add_node`가 아무 정보 없는 `RuntimeError`를 던진다.

## 추가 자료

- **`references/templates.md`** — 작성 가능한 네 범주 전체에 대한 복사-붙여넣기용
  템플릿. 이 포크의 코드와 일치한다
