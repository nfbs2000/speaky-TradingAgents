---
name: ta-workflow-editor
description: 사용자가 "change agent order", "modify workflow", "edit graph", "disable analyst", "enable analyst", "change debate rounds", "modify routing", "add workflow step", "change agent sequence", "parallel analysis", "skip news analyst", "enable checkpoint resume"를 요청하거나 TradingAgents의 LangGraph 워크플로 구조를 수정하려 할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents 워크플로 에디터

TradingAgents의 12개 에이전트를 오케스트레이션하는 LangGraph 워크플로를 수정한다.

## 현재 워크플로

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

> **Sentiment Analyst 관련 주의**: `tools_social`은 여전히 노드로 등록되어 있고 조건부
> 타깃으로 배선되어 있지만, `create_sentiment_analyst`가 `bind_tools`를 호출하지 않으므로
> `last_message.tool_calls`는 항상 비어 있고 라우터는 언제나 `Msg Clear Sentiment`
> 분기를 탄다. 이 도구 노드는 흔적만 남은, 무해한 안전 엣지다. `ANALYST_NODE_SPECS`와
> `_create_tool_nodes()`에서 `tools_social` 항목을 함께 제거하지 않은 채로 삭제하지 않는다.

## 주요 파일

| 파일 | 역할 |
|------|---------------|
| `graph/setup.py` | `GraphSetup.setup_graph()` — `StateGraph`를 만들고 **컴파일되지 않은** 워크플로를 반환 |
| `graph/analyst_execution.py` | `ANALYST_NODE_SPECS` — 노드 이름 레지스트리; `build_analyst_execution_plan()`; `AnalystWallTimeTracker` |
| `graph/conditional_logic.py` | `ConditionalLogic` — 도구 루프와 두 토론의 라우팅 함수 |
| `graph/trading_graph.py` | `TradingAgentsGraph` — 오케스트레이터: LLM 클라이언트, 도구 노드, 메모리 로그, 컴파일, 전파 |
| `graph/propagation.py` | `Propagator.create_initial_state()`, `get_graph_args()` |
| `graph/checkpointer.py` | SQLite 체크포인트/재개 헬퍼 |
| `default_config.py` | `max_debate_rounds`, `max_risk_discuss_rounds`, `max_recur_limit`, `checkpoint_enabled` |

## 노드 이름 레지스트리

애널리스트 노드 이름은 `setup.py`의 문자열 리터럴이 **아니다**.
`graph/analyst_execution.py`의 `ANALYST_NODE_SPECS`에서 온다:

```python
ANALYST_NODE_SPECS = {
    "market":       AnalystNodeSpec("market",       "Market Analyst",       "Msg Clear Market",       "tools_market",       "market_report"),
    "social":       AnalystNodeSpec("social",       "Sentiment Analyst",    "Msg Clear Sentiment",    "tools_social",       "sentiment_report"),
    "news":         AnalystNodeSpec("news",         "News Analyst",         "Msg Clear News",         "tools_news",         "news_report"),
    "fundamentals": AnalystNodeSpec("fundamentals", "Fundamentals Analyst", "Msg Clear Fundamentals", "tools_fundamentals", "fundamentals_report"),
}
```

배선 키 `"social"`은 저장된 설정과의 하위 호환을 위해 유지되며, 표시 라벨은
`"Sentiment Analyst"`다. 노드 이름을 바꾼다면 **여기서** 바꾼다 — 셋업 루프,
wall-time 트래커, CLI 상태 표시가 모두 이 표 하나를 읽는다. 대응하는
`ConditionalLogic.should_continue_social()`은 계속 `"Msg Clear Sentiment"`를 반환해야
한다 (셋업 루프가 `getattr(logic, f"should_continue_{spec.key}")`로 라우터를 찾으므로
메서드 이름은 `_social`로 남는다).

## 자주 하는 수정

### 1. 애널리스트 활성화 / 비활성화

`selected_analysts`는 `propagate()` 인자가 아니라 `TradingAgentsGraph`의 **생성자**
인자다:

```python
graph = TradingAgentsGraph(selected_analysts=["market", "fundamentals"])
```

유효한 키: `"market"`, `"social"`, `"news"`, `"fundamentals"`. 알 수 없는 키는
`ValueError: unknown analyst key: ...`를, 빈 리스트는
`ValueError: at least one analyst must be selected`를 발생시킨다.

기본값은 (`GraphSetup.setup_graph`와 `TradingAgentsGraph.__init__` 양쪽 모두)
튜플 `("market", "social", "news", "fundamentals")`이다.

### 2. 애널리스트 순서 변경

`selected_analysts`의 순서를 바꾼다. 첫 번째 spec이 `START`에서 배선되고, 각
`Msg Clear`가 다음 애널리스트로 이어지며, 마지막 하나가 `Bull Researcher`로 연결된다.
애널리스트는 **순차** 실행이며, 병렬 팬아웃은 없다.

```python
TradingAgentsGraph(selected_analysts=["fundamentals", "market", "social", "news"])
```

`selected_analysts`는 체크포인트 시그니처(`_run_signature()`)의 일부이므로, 이를 바꾸면
저장된 체크포인트가 무효화된다. 예전 그래프 형태로 조용히 재개되지 않는다.

### 3. 토론 라운드 조정

`default_config.py`에서 (또는 환경 변수로):

```python
"max_debate_rounds": 1,         # TRADINGAGENTS_MAX_DEBATE_ROUNDS — Bull/Bear: total turns = 2 × rounds
"max_risk_discuss_rounds": 1,   # TRADINGAGENTS_MAX_RISK_ROUNDS  — 3-way rotation: total turns = 3 × rounds
"max_recur_limit": 100,         # LangGraph recursion limit (no env override)
```

`ConditionalLogic`은 `investment_debate_state["count"] >= 2 * max_debate_rounds`일 때
투자 토론을 종료하고, `risk_debate_state["count"] >= 3 * max_risk_discuss_rounds`일 때
리스크 토론을 종료한다.

### 4. 라우팅 로직 수정

`graph/conditional_logic.py`에서:

- **애널리스트 도구 루프**: `should_continue_{key}`는 `last_message.tool_calls`가 참이면
  해당 spec의 `tool_node`를, 아니면 `clear_node`를 반환한다.
- **투자 토론**: `should_continue_debate`는 카운트에 도달하면 `"Research Manager"`를
  반환하고, 그렇지 않으면 `current_response.startswith("Bull")`일 때
  `"Bear Researcher"`를, 아니면 `"Bull Researcher"`를 반환한다.
- **리스크 토론**: `should_continue_risk_analysis`는 카운트에 도달하면
  `"Portfolio Manager"`를 반환하고, 그렇지 않으면 `latest_speaker`를 기준으로 순환한다 —
  `startswith("Aggressive")` → Conservative, `startswith("Conservative")` →
  Neutral, 그 외에는 Aggressive.

두 토론 라우터 모두 타깃 리스트가 아니라 **완전한 path map**으로 배선된다:

```python
DEBATE_PATH_MAP = {"Bull Researcher": ..., "Bear Researcher": ..., "Research Manager": ...}
RISK_ANALYSIS_PATH_MAP = {"Aggressive Analyst": ..., "Conservative Analyst": ...,
                          "Neutral Analyst": ..., "Portfolio Manager": ...}
```

공용 라우터가 구동하는 모든 엣지는 가능한 반환값을 **전부** 매핑한다. 그래서
폴스루 반환값이 (예를 들어 화자 라벨에 프롬프트 / i18n / 리팩터링 드리프트가 생겼을 때)
누락된 `path_map` 항목에 걸려 실행 중간에 LangGraph를 크래시시키지 못한다
(upstream #1088). **라우터 반환값을 추가하면 path map에도 추가한다** —
`tests/test_risk_router_path_map.py`가 이를 강제한다.

### 5. 새 워크플로 단계 추가

`graph/setup.py`의 `setup_graph()` 안에서:

1. 노드 함수를 만든다.
2. `workflow.add_node("Node Name", node_fn)`.
3. 엣지를 다시 배선한다: 기존 엣지를 제거하고 새 노드를 거치는 엣지를 추가한다.

예 — Trader와 리스크 토론 사이에 노드를 끼워 넣는 경우:

```python
workflow.add_node("Risk Preprocessor", risk_preprocessor_fn)
# 대체 대상: workflow.add_edge("Trader", "Aggressive Analyst")
workflow.add_edge("Trader", "Risk Preprocessor")
workflow.add_edge("Risk Preprocessor", "Aggressive Analyst")
```

### 6. 체크포인트 / 재개 활성화

```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```
또는 `TRADINGAGENTS_CHECKPOINT_ENABLED=true`, 또는 `tradingagents analyze --checkpoint`.

활성화하면 `propagate()`가 티커별 `SqliteSaver`(`data_cache_dir` 아래)로 워크플로를 다시
컴파일하고, 티커 + 날짜 + `_run_signature()`(애널리스트, 토론 깊이, 리스크 깊이, 자산
유형)로 만든 결정적 `thread_id`를 주입한다. `setup_graph()`가 **컴파일되지 않은**
워크플로를 반환하고 `TradingAgentsGraph`가 이를 `self.workflow`에 보관하는 이유가
이것이다 — 다시 컴파일할 수 있어야 한다.
`tradingagents analyze --clear-checkpoints`는 모든 체크포인트 DB를 지운다.

## 그래프 구성 패턴

`setup_graph(selected_analysts)`:

1. `plan = build_analyst_execution_plan(selected_analysts)` — 키를 검증하고 spec을 해석
2. `analyst_factories` 구성 (`quick_thinking_llm`을 감싸는 람다)
3. 리서처 / 매니저 / 트레이더 / 리스크 노드 생성 — **모두 `llm`만 받으며**, 메모리 인자는 없다
4. `workflow = StateGraph(AgentState)`
5. spec마다 `agent_node`, `clear_node`, `tool_node` 추가
6. 고정 노드 8개 추가 (Bull, Bear, Research Manager, Trader, Aggressive, Neutral, Conservative, Portfolio Manager)
7. `add_edge(START, plan.specs[0].agent_node)`; 애널리스트 체인 연결; 마지막 `clear_node` → `Bull Researcher`
8. 공용 path map을 사용해 두 토론의 조건부 엣지 구성
9. `Research Manager → Trader → Aggressive Analyst`; `Portfolio Manager → END`
10. **컴파일되지 않은 `workflow`를 반환** — 컴파일은 호출자가 한다

## 중요: 메시지 클리어

각 애널리스트에는 애널리스트 사이의 메시지 히스토리를 지우는 `Msg Clear {Label}`
노드(`create_msg_delete()`)가 있다. 이는 메시지가 무한정 누적되는 것을 막고 Anthropic
쪽 요구(메시지가 최소 하나는 있어야 함)를 충족시킨다 — 클리어 노드는 자리표시자
`HumanMessage("Continue")`를 추가한다. 메시지 클리어 노드는 제거하지 않는다.

## 검증

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

예상 노드 목록 (기본 애널리스트 4종 기준 20개 노드):

```
Aggressive Analyst, Bear Researcher, Bull Researcher, Conservative Analyst,
Fundamentals Analyst, Market Analyst, Msg Clear Fundamentals, Msg Clear Market,
Msg Clear News, Msg Clear Sentiment, Neutral Analyst, News Analyst,
Portfolio Manager, Research Manager, Sentiment Analyst, Trader,
tools_fundamentals, tools_market, tools_news, tools_social
```

위 스니펫에서 주의할 점 두 가지:

- **`GraphSetup`은 `None` LLM을 받아들인다** — 에이전트 팩토리는 LLM을 클로저로 잡을 뿐이고,
  `bind_structured`가 그로 인한 `AttributeError`를 잡아
  "provider does not support with_structured_output"를 로그로 남긴다. 여기서 stderr에
  경고 네 개가 나오는 것은 정상이며 실패가 아니다.
- **도구 노드는 `None`이면 안 된다** — LangGraph의 `add_node`는 호출 불가능한 값에 대해
  맨 `RuntimeError`를 던지므로 `None` 대신 호출 가능한 스텁을 넘긴다.

`TradingAgentsGraph()`를 인스턴스화하려면 실제 LLM 클라이언트를 만들기 때문에 API 키가
**필요하다**. 그래프 형태만 확인하려면 위의 `GraphSetup` 스니펫을 사용한다.

## 추가 자료

- **`references/graph_structure.md`** — 노드/엣지 표, state 흐름, 도구 노드 구성
