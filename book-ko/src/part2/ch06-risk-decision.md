# 6장: 트레이더·리스크 팀·포트폴리오 매니저

## 투자 계획을 거래 제안으로 바꾼다

Trader node는 네 분석 보고서를 처음부터 다시 읽지 않는다. 리서치 매니저가 압축한
`investment_plan`과 instrument context를 받아 `TraderProposal`을 만든다.

![트레이더](../assets/trader.png)

prompt는 Buy, Sell 또는 Hold 같은 구체적 제안을 요구하지만 외부 tool 사용을 금지한다.
따라서 trader는 새 시장 데이터를 조사하는 agent가 아니라, 연구 조직의 결론을 실행 가능한
문장으로 바꾸는 역할이다.

## 한 번 더 반대 방향으로 검토한다

Trader 뒤에는 세 위험 역할이 있다.

| 역할 | 질문 |
|---|---|
| Aggressive Analyst | 더 큰 기회와 감수 가능한 위험은 무엇인가 |
| Conservative Analyst | 손실, 불확실성, 방어가 필요한 지점은 무엇인가 |
| Neutral Analyst | 두 극단 사이에서 비례적인 위험 판단은 무엇인가 |

![리스크 관리와 포트폴리오 매니저](../assets/risk.png)

이들도 하나의 `RiskDebateState`에 발언 history를 축적한다. 기본 라우팅은 Aggressive →
Conservative → Neutral이며 `count >= 3 * max_risk_discuss_rounds`가 되면 Portfolio
Manager로 간다.

<div class="mermaid">
flowchart LR
    T["Trader proposal"] --> A["Aggressive"]
    A --> C["Conservative"]
    C --> N["Neutral"]
    N --> Q{"risk round 남음?"}
    Q -- "yes" --> A
    Q -- "no" --> P["Portfolio Manager"]
    P --> D["Final decision"]
</div>

## Portfolio Manager가 보는 것

최종 관리자는 다음 입력을 한 prompt에서 받는다.

1. Research Manager의 investment plan
2. Trader의 transaction proposal
3. 세 risk analyst의 전체 debate history
4. 같은 ticker의 이전 결정과 다른 ticker의 최근 reflection
5. 결정적으로 확인한 instrument context

결과는 `PortfolioDecision` schema로 요청하고 Markdown으로 다시 렌더링한다. rating scale은
Research Manager와 같은 다섯 단계다.

## 구조화 출력은 최종 판단의 형태를 고정한다

Research Manager, Trader, Portfolio Manager는 Pydantic schema를 사용한다. provider가
구조화 출력을 지원하지 않거나 JSON이 깨지면 같은 prompt로 free-text를 한 번 호출한다.

이 fallback은 성공을 조작하는 것이 아니라 출력 계약을 낮추는 것이다. warning이 log에
남고, 이후 consumer는 Markdown text를 계속 받을 수 있다. 다만 typed field 보장은 사라진다.

## 실제 주문을 체결하는가

현재 `TradingAgentsGraph._run_graph()`는 `final_trade_decision`을 저장하고
`process_signal()`로 핵심 신호를 뽑아 반환한다. brokerage API에 주문을 보내는 node는 이
graph에 없다.

<div class="truth-note">
<strong>최종 산출물의 정확한 정체</strong>
Portfolio Manager의 결과는 모델이 작성한 구조화 판단과 설명이다. 이를 “시뮬레이션된 조직의
최종 거래 결정”이라고 부를 수는 있지만, 실제 계좌 주문이나 체결 증거라고 부를 수는 없다.
</div>

## 왜 두 번의 검토가 있는가

리서치 토론은 **방향성 thesis**를 검토한다. 위험 토론은 이미 선택된 거래 제안을 **노출과
손실 관점**에서 다시 검토한다. 이 둘을 하나로 합치지 않아 다음을 구분할 수 있다.

- 좋은 회사인가
- 지금 유리한 방향인가
- 이 제안을 현재 위험 조건에서 감수할 수 있는가
- 과거 비슷한 판단에서 무엇을 배웠는가

## 핵심 정리

- Trader는 연구 계획을 거래 제안으로 번역하며 새 데이터를 수집하지 않는다.
- 세 위험 역할은 고정된 순서와 라운드 상한으로 제안을 검토한다.
- Portfolio Manager는 현재 토론과 과거 reflection을 함께 사용한다.
- 구조화 출력 실패 시 free-text로 낮아지며 그 사실이 warning으로 남는다.
- 최종 판단은 텍스트 산출물이지 실제 주문 체결이 아니다.

## 원본 소스

- [`Trader`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/trader/trader.py)
- [`Portfolio Manager`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/managers/portfolio_manager.py)
- [`Risk agents`](https://github.com/nfbs2000/speaky-TradingAgents/tree/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/risk_mgmt)
- [`Structured output helper`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/structured.py)
