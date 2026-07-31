# 5장: 강세·약세 토론과 리서치 매니저

## 보고서를 반대 방향으로 읽는다

분석가들이 네 개의 report를 만들면 Bull Researcher가 먼저 강세 논리를 쓴다. Bear
Researcher는 같은 자료와 직전 강세 주장을 읽고 약세 논리를 만든다. 다음 Bull은 다시 직전
Bear를 반박한다.

![강세·약세 리서처 팀](../assets/researcher.png)

<div class="mermaid">
sequenceDiagram
    participant S as Shared State
    participant B as Bull Researcher
    participant R as Bear Researcher
    participant M as Research Manager
    S->>B: 네 보고서 + debate history
    B->>S: bull argument + count
    S->>R: 네 보고서 + last bull argument
    R->>S: bear argument + count
    loop max_debate_rounds
        S->>B: last bear argument
        B->>S: 반박
        S->>R: last bull argument
        R->>S: 반박
    end
    S->>M: 전체 history
    M->>S: structured investment plan
</div>

## 한 history, 세 가지 view

`InvestDebateState`에는 다음 문자열이 따로 있다.

- `bull_history`: 강세 주장만 축적
- `bear_history`: 약세 주장만 축적
- `history`: 발언 순서대로 합친 전체 토론
- `current_response`: 다음 역할이 직접 반박할 마지막 발언
- `judge_decision`: 리서치 매니저의 최종 투자 계획
- `count`: 종료 라우팅에 쓰는 발언 수

agent끼리 별도 message bus를 쓰는 것이 아니라, node가 이 dictionary를 복사·갱신해 다음
node에 넘긴다.

## 토론 횟수는 prompt가 아니라 router가 제한한다

`max_debate_rounds=1`이면 조건은 `count >= 2`다. Bull과 Bear가 한 번씩 말한 뒤 리서치
매니저로 간다. 라운드를 늘리면 두 발언씩 추가된다.

상한이 graph router에 있으므로 모델이 “더 토론하자”고 써도 무한히 이어지지 않는다. 반대로
두 연구자가 일찍 합의했다고 해도 현재 구현은 합의 의미를 파싱해 조기 종료하지 않는다.

## Research Manager는 심판이자 압축기다

리서치 매니저는 전체 토론 history와 instrument context만 읽고 `ResearchPlan` schema를
만든다. 판단 등급은 다음 다섯 가지다.

| 등급 | 의미 |
|---|---|
| Buy | 강한 강세 확신 |
| Overweight | 노출을 점진적으로 늘릴 우호적 시각 |
| Hold | 근거가 실제로 균형일 때 유지 |
| Underweight | 노출 축소 |
| Sell | 회피 또는 청산 |

이 node에는 `NO_EXTERNAL_TOOLS`가 들어간다. 리서치 매니저가 토론에 없는 새 사실을 검색해
판결을 바꾸는 대신, 이미 수집된 근거와 주장만 정리하게 한다.

## 토론이 주는 것과 주지 않는 것

### 주는 것

- 같은 보고서에서 상반된 thesis를 강제로 추출
- 직전 반론을 prompt에 넣어 단순한 독립 요약보다 충돌을 드러냄
- manager에게 전체 history와 명시적 rating scale 제공
- 라운드 수를 비용·깊이 knob로 사용

### 주지 않는 것

- 독립적인 데이터 수집 기관 두 곳의 합의
- 미래 수익률에 대한 통계적 신뢰도
- 서로 다른 모델이 만든 다양성
- 숨은 reasoning 과정

<div class="risk-note">
<strong>역할 다양성과 증거 다양성은 다르다</strong>
Bull과 Bear가 같은 LLM과 같은 report를 읽을 수 있다. 반대 역할 prompt는 논점의 폭을
넓히지만, 근거 source 자체를 독립적으로 만들지는 않는다.
</div>

## 핵심 정리

- Bull과 Bear는 공유 history를 정해진 순서로 갱신한다.
- 토론 횟수는 count와 설정으로 강제된다.
- 리서치 매니저는 새 데이터를 찾지 않고 토론을 구조화된 투자 계획으로 압축한다.
- 반대 역할은 관점의 다양성을 만들지만 독립된 금융 전문가 합의를 증명하지 않는다.

## 원본 소스

- [`Bull Researcher`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/researchers/bull_researcher.py)
- [`Bear Researcher`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/researchers/bear_researcher.py)
- [`Research Manager`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/managers/research_manager.py)
- [`투자 토론 router`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/conditional_logic.py)
