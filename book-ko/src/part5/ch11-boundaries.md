# 11장: 무엇을 증명하고 무엇을 증명하지 못하는가

## 이 프로젝트가 실제로 보여 주는 것

TradingAgents는 멀티에이전트 금융 분석을 연구하기 좋은 구조를 제공한다.

- 한 문제를 데이터 전문 영역별 report로 나눌 수 있다.
- 같은 근거에 강세와 약세 역할을 적용해 반론을 강제할 수 있다.
- trader 판단과 risk 판단을 다른 state 단계로 분리할 수 있다.
- final decision 이전의 보고서와 토론을 파일로 검토할 수 있다.
- 중단된 graph를 같은 shape에서 재개할 수 있다.
- 과거 판단의 사후 수익률과 reflection을 다음 prompt에 넣을 수 있다.
- 여러 모델·데이터 공급자를 같은 graph contract 아래 비교할 수 있다.

이 항목들은 소스와 실행 산출물로 확인할 수 있다.

## 증명하지 못하는 것

### 수익성

여러 agent가 합의했다고 미래 수익률이 좋아지는 것은 아니다. backtest 결과는 모델, 날짜,
데이터, temperature와 prompt에 민감하다. 원 논문 수치를 현재 코드와 현재 model로 자동
재현한다고 볼 수 없다.

### 독립 전문가 합의

역할들이 같은 provider와 같은 quick model을 사용할 수 있다. Bull, Bear, risk persona는
서로 다른 prompt를 받지만 독립된 기관이나 사람은 아니다.

### 실시간 정확성

가격 snapshot을 검증해도 뉴스·Reddit·StockTwits는 시간이 흐르면 달라진다. historical
analysis date를 고정해도 live social source의 결과까지 고정되지는 않는다.

### 실제 주문 실행

graph의 terminal output은 `final_trade_decision`과 가공된 signal이다. broker order ID,
account balance 변화, fill event는 이 repository의 final node에서 나오지 않는다.

### 모델 학습

decision memory는 Markdown을 다시 prompt에 넣는 retrieval이다. 모델 parameter를 update하는
training이 아니다.

## configured, observed, inferred

이 프로젝트를 평가할 때 세 수준을 구분하면 과장이 줄어든다.

| 수준 | 예 |
|---|---|
| configured | 네 analyst를 선택함, debate round를 2로 설정함 |
| observed | 특정 tool result가 왔음, Bull/Bear history가 저장됨, checkpoint step을 읽음 |
| inferred | 이 토론이 위험 인식을 개선했음, reflection이 다음 판단에 도움을 줌 |

configured role이 존재한다고 실제 node가 성공한 것은 아니다. final report가 있다고 모든
vendor call의 원본과 retry를 관측한 것도 아니다.

## 비용 구조

기본 네 analyst, bull/bear, manager, trader, 세 risk 역할과 portfolio manager를 합치면 한
번의 실행에 여러 LLM 호출이 필요하다. analyst tool loop와 debate round를 늘리면 호출 수와
입력 token이 함께 증가한다.

`max_recur_limit`, debate round, risk round, provider retry budget은 서로 다른 상한이다.
하나를 줄여도 다른 loop가 자동으로 줄어드는 것은 아니다.

## 재현성의 층

<div class="mermaid">
flowchart TD
    A["ticker identity"] --> B["결정적으로 고정 가능"]
    C["가격·분석 날짜"] --> D["부분 고정 가능"]
    E["뉴스·소셜 source"] --> F["시간에 따라 변화"]
    G["LLM 생성"] --> H["비결정적"]
    I["최종 성과"] --> J["시장과 holding window에 의존"]
</div>

같은 ticker와 날짜로 두 번 실행했는데 문장이 달라지는 것은 이 architecture의 자연스러운
특성이다. 연구할 때는 config, model ID, 분석 날짜, source timestamp, raw tool result와
final report를 함께 남겨야 한다.

## 안전한 학습 실험

1. 실제 매매가 아닌 과거 날짜와 paper portfolio를 사용한다.
2. analyst 수와 debate round를 고정해 비교한다.
3. 한 번에 model 또는 data vendor 하나만 바꾼다.
4. final rating뿐 아니라 analyst report와 반론을 함께 비교한다.
5. unavailable sentinel과 fallback warning을 실패 데이터로 보존한다.
6. 사후 수익률과 model reflection을 별도 열로 기록한다.
7. 결과를 금융 조언이 아니라 agent workflow 관찰로 설명한다.

## 이 소스에서 배울 가장 중요한 설계

역할 이름을 많이 만드는 것이 멀티에이전트 설계의 핵심이 아니다. 다음 네 가지가 실제
구조를 만든다.

1. 각 역할이 읽을 수 있는 evidence
2. state에 남겨야 할 artifact
3. 다음 역할로 이동하는 router
4. 중단·데이터 부재·schema 실패를 드러내는 failure contract

<div class="truth-note">
<strong>마지막 기준</strong>
TradingAgents의 가치는 “AI가 시장을 이긴다”는 약속보다, 하나의 복잡한 판단을 역할·근거·
반론·위험·기억으로 분해해 사람이 소스와 산출물을 따라갈 수 있게 만든 데 있다.
</div>

## 핵심 정리

- 이 코드는 멀티에이전트 의사결정 workflow를 연구하는 scaffold다.
- 역할 수, 토론 횟수, model 다양성은 성과 보증이 아니다.
- 설정, 실제 실행, 교육적 해석을 구분해야 한다.
- 최종 판단보다 evidence, state, router와 failure contract를 함께 읽어야 한다.

## 원본 자료

- [TradingAgents README의 연구·재현성 경계](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/README.md)
- [TradingAgents 논문](https://arxiv.org/abs/2412.20138)
- [TauricResearch 면책 고지](https://tauric.ai/disclaimer/)
