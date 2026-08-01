# 그래프 구조 레퍼런스

## 노드 레지스트리

### 애널리스트 노드 (선택된 애널리스트마다, `ANALYST_NODE_SPECS` 기반)

| key | agent_node | clear_node | tool_node | report_key |
|-----|-----------|-----------|-----------|------------|
| `market` | `Market Analyst` | `Msg Clear Market` | `tools_market` | `market_report` |
| `social` | `Sentiment Analyst` | `Msg Clear Sentiment` | `tools_social` | `sentiment_report` |
| `news` | `News Analyst` | `Msg Clear News` | `tools_news` | `news_report` |
| `fundamentals` | `Fundamentals Analyst` | `Msg Clear Fundamentals` | `tools_fundamentals` | `fundamentals_report` |

팩토리 (모두 `quick_thinking_llm`을 받는다):

| agent_node | 팩토리 |
|-----------|---------|
| `Market Analyst` | `create_market_analyst(llm)` |
| `Sentiment Analyst` | `create_sentiment_analyst(llm)` |
| `News Analyst` | `create_news_analyst(llm)` |
| `Fundamentals Analyst` | `create_fundamentals_analyst(llm)` |
| `Msg Clear *` | `create_msg_delete()` |

### 고정 노드

| 노드 이름 | 팩토리 | LLM | 연결 대상 |
|-----------|---------|-----|--------------|
| `Bull Researcher` | `create_bull_researcher(llm)` | quick | 조건부 (DEBATE_PATH_MAP) |
| `Bear Researcher` | `create_bear_researcher(llm)` | quick | 조건부 (DEBATE_PATH_MAP) |
| `Research Manager` | `create_research_manager(llm)` | **deep** | → `Trader` |
| `Trader` | `create_trader(llm)` | quick | → `Aggressive Analyst` |
| `Aggressive Analyst` | `create_aggressive_debator(llm)` | quick | 조건부 (RISK_ANALYSIS_PATH_MAP) |
| `Conservative Analyst` | `create_conservative_debator(llm)` | quick | 조건부 (RISK_ANALYSIS_PATH_MAP) |
| `Neutral Analyst` | `create_neutral_debator(llm)` | quick | 조건부 (RISK_ANALYSIS_PATH_MAP) |
| `Portfolio Manager` | `create_portfolio_manager(llm)` | **deep** | → `END` |

**메모리 인자를 받는 팩토리는 없다.** 이 포크의 메모리는 실행 시작 시 한 번 읽어
`state["past_context"]`에 담는 단일 마크다운 로그이며, 에이전트별 BM25 저장소가 아니다.

## 엣지 맵

### 순차 애널리스트 체인
```
START → specs[0].agent_node
specs[i].agent_node → [conditional should_continue_{key}] → specs[i].tool_node | specs[i].clear_node
specs[i].tool_node  → specs[i].agent_node                         (loop)
specs[i].clear_node → specs[i+1].agent_node                       (or Bull Researcher if last)
```

이 조건부 엣지는 **타깃 리스트** `[current_tools, current_clear]`로 선언된다
(애널리스트 도구 루프는 이 둘만 반환한다).

### 투자 토론
```
(last clear_node) → Bull Researcher
Bull Researcher → [should_continue_debate, DEBATE_PATH_MAP]
Bear Researcher → [should_continue_debate, DEBATE_PATH_MAP]
```

`DEBATE_PATH_MAP` = `{Bull Researcher, Bear Researcher, Research Manager}` — 두 엣지
모두 셋 전부를 매핑하므로 폴스루 반환값이 실행을 크래시시킬 수 없다 (#1088).

교대 규칙: `count >= 2 * max_debate_rounds`이면 `Research Manager`로 빠져나가고,
그렇지 않으면 `current_response.startswith("Bull")`일 때 Bear, 아니면 Bull.

### 토론 이후
```
Research Manager → Trader
Trader → Aggressive Analyst
```

### 리스크 토론 (3자 순환)
```
Aggressive Analyst   → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Conservative Analyst → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Neutral Analyst      → [should_continue_risk_analysis, RISK_ANALYSIS_PATH_MAP]
Portfolio Manager    → END
```

`RISK_ANALYSIS_PATH_MAP` = `{Aggressive Analyst, Conservative Analyst,
Neutral Analyst, Portfolio Manager}`.

순환 규칙: `count >= 3 * max_risk_discuss_rounds`이면 `Portfolio Manager`로 빠져나가고,
그렇지 않으면 `latest_speaker.startswith("Aggressive")` → Conservative,
`startswith("Conservative")` → Neutral, 그 외에는 Aggressive.

## ConditionalLogic 메서드

```python
class ConditionalLogic:
    def __init__(self, max_debate_rounds=1, max_risk_discuss_rounds=1)

    # 애널리스트 도구 루프 — getattr(logic, f"should_continue_{spec.key}") 로 해석된다
    def should_continue_market(state)       -> "tools_market"       | "Msg Clear Market"
    def should_continue_social(state)       -> "tools_social"       | "Msg Clear Sentiment"
    def should_continue_news(state)         -> "tools_news"         | "Msg Clear News"
    def should_continue_fundamentals(state) -> "tools_fundamentals" | "Msg Clear Fundamentals"

    def should_continue_debate(state)        -> "Bear Researcher" | "Bull Researcher" | "Research Manager"
    def should_continue_risk_analysis(state) -> "Conservative Analyst" | "Neutral Analyst"
                                              | "Aggressive Analyst" | "Portfolio Manager"
```

비대칭성에 주의한다. 메서드 이름의 접미사는 **배선 키**(`social`)이고, 반환되는
clear 노드 라벨은 **표시 이름**(`Msg Clear Sentiment`)이다.

## 그래프를 통과하는 State 흐름

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

`AgentState`는 `MessagesState`를 확장하므로 `messages`는 리듀서가 관리한다. 나머지
필드는 모두 마지막 쓰기가 이긴다.

업스트림 기본 버전에는 없는 필드: `asset_type`, `instrument_context`, `past_context`.

## 워크플로에 영향을 주는 설정 파라미터

```python
"max_debate_rounds": 1,        # investment debate turns = 2 × this
"max_risk_discuss_rounds": 1,  # risk debate turns = 3 × this
"max_recur_limit": 100,        # LangGraph recursion_limit, set by Propagator
"checkpoint_enabled": False,   # recompile with SqliteSaver, resume on crash
```

`Propagator.get_graph_args()`는
`{"stream_mode": "values", "config": {"recursion_limit": max_recur_limit}}`를 반환한다.

## 도구 노드

`TradingAgentsGraph._create_tool_nodes()`에서 생성된다:

```python
"market":       ToolNode([get_stock_data, get_indicators, get_verified_market_snapshot])
"social":       ToolNode([get_news])          # 등록되어 있으나 도달 불가 — 애널리스트가 도구를 바인딩하지 않는다
"news":         ToolNode([get_news, get_global_news, get_insider_transactions,
                          get_macro_indicators, get_prediction_markets])
"fundamentals": ToolNode([get_fundamentals, get_balance_sheet, get_cashflow,
                          get_income_statement])
```

`get_verified_market_snapshot`은 market 도구 노드에 **반드시** 남아 있어야 한다.
Market Analyst의 프롬프트가 이 도구 호출을 요구하는데, 실행 가능하지 않으면 호출이
실패하고 모델은 해당 데이터를 "unavailable"로 보고한다.

News Analyst의 프롬프트는 `get_insider_transactions`를 언급하지 않지만 (내부자 데이터는
개념상 fundamentals 쪽에서 쓴다), 이 도구는 news 노드에 바인딩되어 있다. 바인딩된 도구가
하나 더 있는 것은 무해하다.

## 애널리스트 Wall-Time 추적

`graph/analyst_execution.py`의 `AnalystWallTimeTracker(plan)`가 CLI의 애널리스트별
시간 표시를 구동한다. `sync_analyst_tracker_from_chunk(tracker, chunk)`는 스트리밍된
청크에서 어떤 `report_key`가 채워졌는지로 진행 상황을 추론한다. 리포트가 비어 있지 않은
spec은 시작+완료로 표시되고, 리포트가 없는 첫 spec은 시작으로 표시된다. 애널리스트를
추가한다면 `ANALYST_NODE_SPECS`의 `report_key`가 그 노드가 쓰는 state 필드와 일치해야
하며, 그러지 않으면 타이밍이 조용히 진행을 멈춘다.

## 체크포인트 시그니처

```python
def _run_signature(self, asset_type):
    return "|".join([
        "analysts=" + ",".join(self.selected_analysts),
        f"debate={self.config['max_debate_rounds']}",
        f"risk={self.config['max_risk_discuss_rounds']}",
        f"asset={asset_type}",
    ])
```

`thread_id(ticker, date, signature)`에 키로 들어간다. 그래프 형태가 바뀌면 호환되지 않는
체크포인트에서 재개하는 대신 새 실행을 시작한다 (#1089). 그래프 형태를 바꾸는 설정 항목을
추가한다면 여기에도 추가한다.
