# 1장: TradingAgents는 무엇인가

## 이 장의 질문

“여러 금융 전문가가 토론한다”는 설명을 코드로 바꾸면 무엇이 남는가?

TradingAgents는 현실의 트레이딩 회사를 모사한다. 시장·심리·뉴스·재무 분석가가 각자의
보고서를 만들고, 강세와 약세 연구자가 그 보고서를 두 방향으로 논박한다. 리서치 매니저가
투자 계획을 선택하고, 트레이더가 거래 제안을 작성한다. 마지막으로 세 가지 위험 관점이
제안을 검토하고 포트폴리오 매니저가 최종 등급을 낸다.

![TradingAgents 전체 구조](../assets/schema.png)

이 그림은 단순한 조직도가 아니다. `GraphSetup.setup_graph()`에 실제 node와 edge로
등록되는 순서다.

<div class="mermaid">
flowchart LR
    A["시장·심리·뉴스·재무 분석"] --> B["강세 vs 약세 토론"]
    B --> C["리서치 매니저"]
    C --> D["트레이더"]
    D --> E["공격·중립·보수 위험 토론"]
    E --> F["포트폴리오 매니저"]
    F --> G["최종 5단계 판단"]
</div>

## 세 층으로 보면 쉽다

### 1. 근거 생산층

분석가가 가격, 기술 지표, 뉴스, 소셜 메시지, 재무제표, 거시경제, 예측시장을 읽고 보고서를
만든다. 여기서만 외부 데이터와 직접 만나는 경우가 많다.

### 2. 판단 조립층

리서처, 트레이더, 위험 분석가와 매니저는 앞에서 만든 보고서와 토론 history를 입력으로
받는다. 일부 관리 node는 외부 tool을 금지하고, prompt 안에 이미 들어온 근거만 사용한다.

### 3. 지속성층

최종 state는 JSON과 Markdown 보고서로 저장된다. 선택적으로 LangGraph checkpoint가 실행
중간을 저장하고, decision log가 과거 판단과 사후 수익률을 다음 분석에 전달한다.

## “멀티에이전트”의 정확한 의미

각 역할은 별도의 prompt와 상태 갱신 함수를 갖는다. 그러나 런타임이 임의의 agent를
spawn하거나 agent가 다음 동료를 자유롭게 고르는 구조는 아니다.

| 있는 것 | 없는 것 |
|---|---|
| 역할별 LLM node | 런타임 team creation |
| 분석가별 도구 경계 | agent가 임의로 새 agent spawn |
| 고정된 토론 순서 | 자유 형식의 peer-to-peer mailbox |
| 공유된 typed state | 서로 독립된 장기 session |
| conditional edge | 목표를 보고 graph 자체를 다시 설계하는 기능 |

<div class="source-note">
<strong>소스에서 확인하기</strong>
`tradingagents/graph/setup.py`는 모든 node와 edge를 한곳에서 등록한다.
`tradingagents/agents/utils/agent_states.py`는 역할들이 공유하는 state를 정의한다.
</div>

## 입력과 출력

한 번의 실행 입력은 보통 ticker, 분석 날짜, asset type, 선택한 analyst, 모델·데이터 설정이다.
출력은 주문 API 호출이 아니라 다음 두 값이다.

1. 보고서와 토론 history를 모두 담은 final state
2. `final_trade_decision`을 다시 가공한 핵심 신호

CLI는 이를 저장하고 화면에 보여준다. Python API는 `TradingAgentsGraph.propagate()` 반환값을
직접 받을 수 있다.

## 핵심 정리

- TradingAgents는 금융 역할을 LangGraph node로 옮긴 연구용 workflow다.
- 외부 데이터 수집, 논쟁, 거래 제안, 위험 검토를 서로 다른 책임으로 분리한다.
- 실제 실행 순서는 동적으로 탄생하는 조직이 아니라 소스에 고정된 graph다.
- 결과는 텍스트 기반 판단과 보고서이며 실제 증권 주문 체결이 아니다.

## 원본 소스

- [`GraphSetup`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/setup.py)
- [`AgentState`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/agent_states.py)
- [`TradingAgentsGraph`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py)
