# 3장: 상태와 LangGraph

## agent 사이를 이동하는 것은 state다

TradingAgents의 협업은 agent session끼리 직접 대화하는 방식이 아니다. 하나의 `AgentState`가
node를 지나며 report, debate history, trader plan과 final decision을 축적한다.

| state 영역 | 대표 필드 | 생산자 | 다음 소비자 |
|---|---|---|---|
| 실행 정체 | ticker, asset type, date, instrument context | 초기화 | 모든 역할 |
| 분석 보고서 | market, sentiment, news, fundamentals | 네 분석가 | bull·bear 연구자 |
| 투자 토론 | bull/bear/history/count/judge | 연구자·리서치 매니저 | trader |
| 거래 제안 | investment plan, trader plan | 매니저·trader | risk team |
| 위험 토론 | aggressive/conservative/neutral history | 위험 분석가 | portfolio manager |
| 장기 문맥 | past context | memory log | portfolio manager |
| 최종 판단 | final trade decision | portfolio manager | 저장·신호 처리 |

`AgentState`는 LangGraph의 `MessagesState`를 상속한다. `messages`는 analyst와 tool이 왕복할 때
필요하고, 별도 report field는 이후 역할에게 안정된 산출물을 전달한다.

## 분석가 순서는 실행 계획이 결정한다

`build_analyst_execution_plan()`은 사용자가 선택한 key를 `AnalystNodeSpec`으로 바꾼다.
각 spec에는 agent node, clear node, tool node, report key가 함께 있다.

```python
AnalystNodeSpec(
    key="market",
    agent_node="Market Analyst",
    clear_node="Msg Clear Market",
    tool_node="tools_market",
    report_key="market_report",
)
```

이 표가 중요한 이유는 문자열로 흩어진 네 이름을 하나의 계약으로 묶기 때문이다. 알 수 없는
key와 빈 analyst 목록은 graph를 만들기 전에 실패한다.

## graph는 고정되고, 분기만 조건부다

<div class="mermaid">
stateDiagram-v2
    [*] --> Analyst
    Analyst --> Tools: tool_calls 있음
    Tools --> Analyst
    Analyst --> NextAnalyst: tool_calls 없음
    NextAnalyst --> Bull
    Bull --> Bear
    Bear --> Bull: 토론 라운드 남음
    Bull --> ResearchManager: 라운드 종료
    Bear --> ResearchManager: 라운드 종료
    ResearchManager --> Trader
    Trader --> Aggressive
    Aggressive --> Conservative
    Conservative --> Neutral
    Neutral --> Aggressive: 위험 라운드 남음
    Aggressive --> PortfolioManager: 라운드 종료
    Conservative --> PortfolioManager: 라운드 종료
    Neutral --> PortfolioManager: 라운드 종료
    PortfolioManager --> [*]
</div>

conditional router가 반환할 수 있는 target은 `DEBATE_PATH_MAP`과
`RISK_ANALYSIS_PATH_MAP`에 전부 명시된다. 모델 응답의 speaker label이 흔들려도 LangGraph가
없는 edge를 찾아 crash하지 않게 하려는 방어다.

## 토론의 전환 조건

투자 토론은 `count >= 2 * max_debate_rounds`가 되면 리서치 매니저로 이동한다. 그 전에는
현재 응답이 `Bull`로 시작하면 Bear, 아니면 Bull이다.

위험 토론은 `count >= 3 * max_risk_discuss_rounds`가 되면 포트폴리오 매니저로 이동한다.
그 전에는 Aggressive → Conservative → Neutral 순서를 speaker 이름으로 판정한다.

<div class="source-note">
<strong>설계의 대가</strong>
문자열 prefix가 routing contract에 들어간다. 완전한 자유 대화보다 단순하고 읽기 쉽지만,
표현 변경과 다국어화가 router를 흔들 수 있다. 전체 path map과 명시적인 count 상한은 이
취약성을 완화한다.
</div>

## “동적 토론”을 과장하지 않기

토론 내용은 LLM이 생성하므로 매번 달라진다. 그러나 참여자, 발언 순서와 종료 조건은 코드에
고정돼 있다. 따라서 이 프로젝트의 dynamic은 **내용의 비결정성**과 **tool loop의 조건부
반복**을 뜻한다. 실행 중 graph topology가 자라나는 것은 아니다.

## 핵심 정리

- 협업의 실체는 공유 typed state와 report field다.
- analyst plan은 선택 가능한 역할을 안전한 node 묶음으로 바꾼다.
- graph topology는 고정이고 tool call 및 라운드 종료만 조건부다.
- 문자열 speaker와 count가 토론을 제어하므로 자유로운 team runtime과는 다르다.

## 원본 소스

- [`AgentState`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/agent_states.py)
- [`AnalystExecutionPlan`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/analyst_execution.py)
- [`GraphSetup`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/setup.py)
- [`ConditionalLogic`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/conditional_logic.py)
