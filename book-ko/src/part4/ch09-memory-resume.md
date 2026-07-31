# 9장: 기억, 반성, 체크포인트 재개

## 두 지속성은 목적이 다르다

TradingAgents에는 “이전 실행을 기억한다”는 말로 묶기 쉬운 두 기능이 있다.

| 기능 | 저장소 | 목적 | 성공 후 |
|---|---|---|---|
| decision memory | append-only Markdown | 과거 판단·실제 수익률·reflection을 다음 분석에 사용 | 계속 보존 |
| checkpoint | ticker별 SQLite | 중단된 LangGraph 실행을 같은 지점에서 재개 | 해당 thread 정리 |

checkpoint를 장기 기억이라고 부르거나 decision log를 중단 복구 state라고 부르면 안 된다.

## Decision memory의 두 단계

### Phase A: 결정 직후

실행이 끝나면 최종 판단을 다음 형태로 append한다.

```text
[날짜 | ticker | rating | pending]

DECISION:
최종 판단 본문
```

같은 날짜와 ticker의 pending entry가 이미 있으면 중복 append하지 않는다.

### Phase B: 다음 같은 ticker 실행 전

이전 분석 날짜로부터 기본 5 거래일 뒤의 실제 수익률을 yfinance에서 구한다. 지역별 benchmark
map으로 SPY, Nikkei, Hang Seng 같은 비교 지수를 선택하고 raw return과 alpha를 계산한다.

그 결과를 quick model의 reflection prompt에 넣고, pending tag를 실제 수익률과 reflection이
있는 resolved entry로 바꾼다.

<div class="mermaid">
flowchart LR
    D["최종 결정"] --> P["pending memory"]
    P --> N["다음 같은 ticker 실행"]
    N --> R["실제 수익률·benchmark alpha"]
    R --> F["LLM reflection"]
    F --> U["resolved memory"]
    U --> C["다음 Portfolio Manager context"]
</div>

가격이 아직 없거나 network 오류가 나면 entry는 pending으로 남아 다음 실행에서 다시
시도한다. 다른 ticker의 pending은 그 ticker를 다시 분석할 때까지 처리하지 않는다.

## 다음 판단에 무엇을 넣는가

`get_past_context()`는 resolved entry만 읽는다.

- 같은 ticker 최근 5개: 결정과 reflection 전체
- 다른 ticker 최근 3개: reflection 중심

이 문자열은 초기 state의 `past_context`가 되고 Portfolio Manager prompt에 들어간다.
모델 weight가 바뀌는 학습이 아니라, 명시적으로 저장한 과거 문장을 다음 prompt에 추가하는
retrieval memory다.

<div class="truth-note">
<strong>반성의 의미</strong>
reflection은 실제 수익률을 입력으로 받은 LLM의 사후 설명이다. 실제 결과 수치는 관측값이지만
“왜 맞았거나 틀렸는가”는 모델의 해석이다. 둘을 같은 사실 수준으로 취급하지 않는다.
</div>

## Checkpoint thread의 정체

checkpoint는 ticker별 SQLite DB에 저장된다. thread ID는 다음 입력을 hash한다.

```text
ticker + 분석 날짜 + analyst 선택 + debate 깊이 + risk 깊이 + asset type
```

같은 ticker와 날짜라도 graph shape가 바뀌면 이전 checkpoint를 재사용하지 않는다. 예를 들어
분석가를 네 명에서 두 명으로 줄였는데 옛 node state를 이어 받는 오류를 막는다.

## 재개 lifecycle

1. `checkpoint_enabled`를 확인한다.
2. ticker별 SQLite saver를 연다.
3. saver를 넣어 workflow를 다시 compile한다.
4. 같은 thread의 최신 step이 있으면 resume log를 남긴다.
5. graph를 실행한다.
6. 성공하면 해당 thread의 checkpoint row를 지운다.
7. DB connection을 닫고 checkpoint 없는 graph로 되돌린다.

exception이나 프로세스 중단으로 성공 정리까지 가지 못했을 때만 다음 실행에 resume할 state가
남는다.

## 원자성과 범위

memory log update는 temp file을 쓴 뒤 replace한다. 한 번의 crash로 전체 Markdown log가
깨지는 위험을 줄인다. 설정된 최대 entry 수를 넘으면 오래된 resolved entry만 제거하고,
아직 평가하지 않은 pending은 보존한다.

checkpoint는 ticker별 DB를 사용해 서로 다른 ticker가 같은 SQLite file을 다투지 않게 한다.
하지만 한 graph 실행의 모든 외부 API side effect를 되돌리는 transaction은 아니다.

## 핵심 정리

- decision memory는 성공한 판단을 다음 분석에 학습 문맥으로 전달한다.
- 실제 수익률과 LLM reflection은 사실 수준이 다르다.
- checkpoint는 중단 복구용이며 성공 시 지워진다.
- graph shape signature가 맞아야 같은 checkpoint를 재개한다.
- “memory”는 모델 학습이 아니라 파일 기반 retrieval prompt다.

## 원본 소스

- [`TradingMemoryLog`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/memory.py)
- [`checkpointer.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/checkpointer.py)
- [`run signature와 memory 연결`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py)
- [`reflection.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/reflection.py)
