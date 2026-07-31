# 2장: 한 번의 분석이 지나가는 길

## 시작은 graph보다 설정이 먼저다

`TradingAgentsGraph` 생성자는 설정을 dataflow 계층에 전달하고, 결과와 cache 디렉터리를 만든다.
그다음 같은 provider에서 두 모델 client를 만든다.

- `quick_thinking_llm`: 분석가, 연구자, 트레이더, reflection처럼 반복 호출되는 역할
- `deep_thinking_llm`: 리서치 매니저와 포트폴리오 매니저처럼 결론을 조립하는 역할

이 구분은 서로 다른 provider를 섞는 기능이 아니라 같은 provider 안에서 빠른 모델과 깊은
모델을 나누는 기본 전략이다.

## 실행 전 준비

`propagate(ticker, trade_date, asset_type)`는 다음 순서로 들어간다.

<div class="mermaid">
flowchart TD
    I["ticker · 날짜 · asset type"] --> P["이전 pending 결정의 실제 수익률 확인"]
    P --> C{"checkpoint 사용?"}
    C -- "예" --> DB["ticker별 SQLite 연결·graph 재컴파일"]
    C -- "아니오" --> S["초기 state 생성"]
    DB --> S
    S --> ID["instrument identity 확정"]
    ID --> G["LangGraph 실행"]
    G --> L["final state JSON 저장"]
    L --> M["결정을 memory log에 pending으로 추가"]
    M --> X["checkpoint 정리"]
    X --> R["final state + 핵심 신호 반환"]
</div>

특히 ticker identity는 LLM에 맡기지 않는다. `resolve_instrument_identity()`로 종목 정체를
먼저 확인하고 `instrument_context`로 만들어 모든 agent state에 넣는다. 같은 ticker를
서로 다른 회사로 해석하는 오류를 줄이기 위한 결정적 anchor다.

## graph 실행 방식은 두 가지다

### 일반 모드

`graph.invoke()`가 최종 state 하나를 반환한다. 호출자는 중간 node를 보지 않고 완성된 결과를
받는다.

### debug 모드

`graph.stream()`이 node별 delta를 순서대로 낸다. 구현은 각 chunk를 모아 마지막에 직접
merge한다. node가 새 message를 추가하지 않으면 이전 message가 반복될 수 있어, 화면 출력은
message type과 content signature가 달라질 때만 수행한다.

<div class="truth-note">
<strong>streaming의 범위</strong>
debug stream은 graph node delta를 보여 주는 실행 모드다. agent들이 동시에 실행된다는 뜻이
아니다. 현재 analyst plan은 선택한 분석가를 순서대로 연결한다.
</div>

## 분석가 구간의 작은 loop

시장·뉴스·재무 분석가는 LLM이 tool call을 내는 동안 자기 ToolNode와 왕복한다. 더 이상 tool
call이 없으면 report를 state에 남기고 message clear node를 지나 다음 분석가로 이동한다.

<div class="mermaid">
flowchart LR
    A["Analyst LLM"] --> D{"tool_calls?"}
    D -- "yes" --> T["해당 ToolNode"]
    T --> A
    D -- "no" --> R["report 저장"]
    R --> C["messages clear"]
    C --> N["다음 analyst"]
</div>

심리 분석가는 예외다. 뉴스·StockTwits·Reddit 데이터를 node 내부에서 먼저 가져와 prompt에
넣고 구조화 출력을 호출한다. 따라서 graph에는 social ToolNode가 존재하지만 정상 심리
분석 경로에서는 tool call을 만들지 않고 바로 report를 쓴다.

## 성공 이후 남는 것

성공한 실행은 세 종류의 기록을 만들 수 있다.

| 기록 | 목적 |
|---|---|
| `full_states_log_<date>.json` | 모든 보고서와 토론 state 보존 |
| report tree | analyst, research, trader, risk, portfolio별 Markdown |
| memory log | 최종 결정과 이후 평가를 다음 실행에 연결 |

checkpoint는 성공하면 해당 thread row를 지운다. 그러므로 checkpoint DB는 완성된 역사
보관소가 아니라 중단된 실행을 재개하기 위한 임시 지속성이다.

## 핵심 정리

- 실행 전에 모델 client, 데이터 설정, instrument identity와 초기 state를 준비한다.
- analyst의 tool loop와 전체 trading graph는 서로 다른 두 수준의 흐름이다.
- debug streaming은 관찰 방식이지 동시 실행 보장이 아니다.
- 성공 결과, 장기 decision memory, 중단 복구 checkpoint는 서로 다른 파일과 책임을 가진다.

## 원본 소스

- [`TradingAgentsGraph.propagate`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py)
- [`Propagator`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/propagation.py)
- [`Sentiment Analyst`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/sentiment_analyst.py)
