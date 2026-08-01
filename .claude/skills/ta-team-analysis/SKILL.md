---
name: ta-team-analysis
description: 사용자가 "run trading analysis", "analyze stock with team", "team trading analysis", "run TLRY analysis", "stock analysis team", "trading team report", "multi-agent stock analysis", "run team analysis for [TICKER]", "종목 분석 팀 실행" 등을 요청하거나, Claude Code 서브에이전트로 구동되고 리포트를 자동 저장하는 멀티 에이전트 트레이딩 분석을 원할 때 사용하는 스킬.
version: 0.2.0
---

# TradingAgents Team Analysis Orchestration

Claude Code 서브에이전트 팀을 실행해 여러 관점의 트레이딩 분석을 만들고
모든 리포트를 디스크에 저장한다.

## 먼저 올바른 도구를 골라라

이 스킬은 **웹 검색을 쓰는 Claude Code 서브에이전트**를 사용한다. Python 파이프라인은
실행하지 않는다. 의도적으로 선택하라:

| 원하는 것 | 사용할 것 |
|---|---|
| 프레임워크의 실제 12-에이전트 LangGraph 파이프라인, 구조화 출력, memory 로그, 저장된 리포트 트리 | `tradingagents analyze`, 또는 `ta-eval-backtest` / `run_single_eval.py` |
| 지금 당장 실행하는 라이브 웹 리서치 분석, API 키나 설치 불필요 | **이 스킬** |
| 둘을 비교 | 둘 다 실행하고 최종 시그널을 diff |

Python 파이프라인이 제품이고, 이 스킬은 벤더 API 대신 웹 검색으로 그 *형태*
(analysts → debate → risk → decision)를 모사하는 리서치 하네스다. 출력은 파이프라인
출력과 **호환되지 않는다**: 구조화 스키마 없음, 5단계 `parse_rating` 계약 없음,
memory 로그 항목 없음.

## 사전 조건

- 서브에이전트 스폰 가능 (`Agent` 도구).
- 서브에이전트가 `WebSearch` / `WebFetch`를 사용할 수 있어야 한다.
- 환경 변수는 필요 없다. 이 스킬의 예전 버전은 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`을
  요구하고 `TeamCreate` / `TeamDelete`를 사용했지만, **그 도구들은 더 이상 존재하지 않는다** —
  세션에는 암묵적 팀 하나만 있으며 `Agent`의 `team_name` 파라미터는 deprecated이고 무시된다.
  호출하지 마라.

## 입력 변수

시작 전에 사용자에게서 수집한다 (없으면 물어라):

| 변수 | 설명 | 예시 |
|----------|-------------|---------|
| `{TICKER}` | 티커 심볼 | `TLRY` |
| `{PRICE}` | 현재 대략적인 가격 | `~$7.99` |
| `{DATE}` | 분석 날짜 (YYYY-MM-DD) | `2026-07-31` |

파생: `{OUTPUT_DIR}` = `output/{TICKER}/{DATE}`

`{DATE}`는 오늘로 기본 설정하고 확인받아라. `{PRICE}`를 모르면 지어내지 말고 프롬프트에
모른다고 명시하라 — 조작된 기준 가격은 이후의 모든 지지/저항선과 risk/reward 수치를
오염시킨다.

## 출력 디렉터리 구조

```
output/{TICKER}/{DATE}/
├── 01-technical-analysis.md       ← ta-market-analyst
├── 02-fundamentals-analysis.md    ← ta-fundamentals-analyst
├── 03-news-sentiment-analysis.md  ← ta-news-sentiment-analyst
├── 04-risk-trade-decision.md      ← ta-risk-trader
└── 05-final-report.md             ← you (orchestrator)
```

## 팀 구조

```
you = orchestrator (ta-lead, or the main conversation)
├── ta-market-analyst           technical: price trends, volume, indicators, patterns
├── ta-fundamentals-analyst     financials, valuation, competitive position
├── ta-news-sentiment-analyst   recent news, analyst ratings, social sentiment
└── ta-risk-trader              bull/bear debate + risk assessment + final signal
```

**이 넷은 `.claude/agents/`에 에이전트로 정의되어 있다.** `subagent_type`으로 스폰하라 —
각자 이미 자신의 역할, 분석 요구사항, 근거 원칙, 리포트 형식, 출력 프로토콜을 갖고 있다:

```
Agent(subagent_type: "ta-market-analyst", name: "ta-market-analyst", ...)
```

각 에이전트가 **어떻게** 동작하는지에 대한 단일 진실 공급원은 에이전트 정의 파일이다.
이 스킬은 오케스트레이션과 넘겨주는 **실행별 변수**만 담당한다. 스폰 프롬프트에
에이전트의 지시사항을 다시 적지 마라 — 같은 프롬프트가 두 벌 있으면 서로 어긋나고,
에이전트 파일이 우선한다.

## 실행 워크플로우

### Step 1 — 출력 디렉터리 생성

```
Bash: mkdir -p output/{TICKER}/{DATE}
```

### Step 2 — 태스크 생성

`TaskCreate`로 태스크 5개를 만든다:

| # | Subject | Description |
|---|---------|-------------|
| 1 | Technical analysis for {TICKER} | 가격 추세, 지표, 차트 패턴 |
| 2 | Fundamentals analysis for {TICKER} | 재무, 밸류에이션, 경쟁 지위 |
| 3 | News/sentiment analysis for {TICKER} | 최근 뉴스, 애널리스트 등급, 소셜 센티먼트 |
| 4 | Risk assessment & trading decision for {TICKER} | 강세/약세 논쟁, 리스크 평가, 시그널 |
| 5 | Final synthesis report for {TICKER} | 넷을 종합해 최종 추천 도출 |

그다음 `TaskUpdate`로 의존관계를 연결한다:
- task 4: `addBlockedBy: ["1", "2", "3"]`
- task 5: `addBlockedBy: ["1", "2", "3", "4"]`

각 태스크는 스폰할 에이전트 이름과 일치하도록 `TaskUpdate`의 `owner`로 배정한다.

### Step 3 — 애널리스트 3명을 병렬로 스폰

`ta-market-analyst`, `ta-fundamentals-analyst`, `ta-news-sentiment-analyst`를
**하나의 메시지에서 `Agent` 호출 3개로** 스폰해 동시에 실행시킨다:

```
Agent(
  name: "ta-market-analyst",
  subagent_type: "ta-market-analyst",
  description: "Technical analysis for {TICKER}",
  prompt: <dispatch variables — see below>,
  run_in_background: true,     # default; you are notified on completion
)
```

`team_name`은 넘기지 마라 — 무시된다.

#### 디스패치 변수 (스폰 프롬프트 전체)

각 에이전트는 자기 일을 이미 안다. 실행별 값만 넘겨라:

```
TICKER: {TICKER}
PRICE: {PRICE}                     # or "unknown" — do not invent one
DATE: {DATE}
OUTPUT_DIR: {OUTPUT_DIR}
TASK_ID: <the task you assigned this agent>
REPORT_TO: ta-lead                 # or "main" if the main conversation is orchestrating
```

사용자가 추가 맥락(검증할 논지, 특정 촉매, 시간 지평)을 준 경우에만 덧붙여라. 분석
요구사항이나 출력 프로토콜은 절대 다시 지정하지 마라 — 그것들은 `.claude/agents/ta-*.md`에 있다.

`{PRICE}`를 모르면 문자 그대로 `unknown`을 넘겨라. 에이전트들은 숫자를 지어내는 대신
기준값 없음으로 취급하도록 지시받았다.

### Step 4 — 1–3 완료 후 ta-risk-trader 스폰

셋의 완료 알림을 모두 기다리고, **세 파일이 존재하며 비어 있지 않은지 검증한** 뒤 같은
디스패치 변수로 `ta-risk-trader`를 스폰하라. 이 에이전트는 세 파일을 디스크에서 읽고
하나라도 없으면 거부하고 보고하도록 지시받았으므로, 일찍 스폰하면 나쁜 결과가 나오는 게
아니라 실행 한 번을 낭비하게 된다.

### Step 5 — 결과 수신 및 종합

각 에이전트가 완료될 때마다:
1. `Glob` / `Read`로 리포트 파일이 존재하고 내용이 있는지 확인한다.
2. `TaskUpdate`로 해당 태스크를 `completed`로 바꾼다 (에이전트가 직접 하도록
   지시받았지만, 가정하지 말고 검증하라).

네 리포트가 모두 존재하면:
1. 네 파일을 모두 읽는다.
2. `05-final-report.md`를 작성한다.
3. `TaskUpdate`로 task 5를 `completed`로 바꾼다.

### Step 6 — 사용자에게 보고

최종 시그널과 네 에이전트의 결론을 답변에 요약하고 `05-final-report.md` 경로를 알려줘라.
에이전트들에게 `shutdown_request`를 보내지 **말고** `TeamDelete`도 호출하지 마라 —
백그라운드 서브에이전트는 스스로 끝나며, 셧다운 요청을 먼저 보내는 것은 사용자가 요청할
때만 하는 일이다.

## 에이전트 프롬프트 템플릿

**여기에는 의도적으로 없다.** 각 에이전트의 역할, 분석 요구사항, 근거 원칙, 리포트 형식,
출력 프로토콜은 각자의 정의 파일에 있다:

| Agent | Definition | Writes |
|---|---|---|
| `ta-market-analyst` | `.claude/agents/ta-market-analyst.md` | `01-technical-analysis.md` |
| `ta-fundamentals-analyst` | `.claude/agents/ta-fundamentals-analyst.md` | `02-fundamentals-analysis.md` |
| `ta-news-sentiment-analyst` | `.claude/agents/ta-news-sentiment-analyst.md` | `03-news-sentiment-analysis.md` |
| `ta-risk-trader` | `.claude/agents/ta-risk-trader.md` | `04-risk-trade-decision.md` |

어떤 에이전트가 무엇을 만들어낼지 알아야 하면 그 에이전트 파일을 읽어라. 에이전트 동작을
바꾸려면 이 스킬이 아니라 그 파일을 편집해야 한다.

각 에이전트는 순서대로 다음을 하도록 지시받았다: 위 경로에 리포트를 `Write`하고,
`TaskUpdate`로 태스크를 `completed`로 바꾸고, 리포트 전문을 `REPORT_TO`에 `SendMessage`한다.
또한 각자 리포트를 고정된 판정 라인(`## Technical Direction:`, `## Fundamental Rating:`,
`## Sentiment Direction:`, `## FINAL SIGNAL:`)과 **Data Gaps** 섹션으로 끝맺는다 —
종합 표는 그것을 기준으로 작성한다.

## 오케스트레이터 종합 프로토콜

### 1. 파일 검증
```
Glob: output/{TICKER}/{DATE}/0*.md
```
`01`부터 `04`까지 존재하고 비어 있지 않은지 확인한다.

### 2. 네 리포트를 모두 읽는다

### 3. `05-final-report.md` 작성

```markdown
# {TICKER} Comprehensive Trading Report

**Date**: {DATE} | **Price**: {PRICE} | **Agents**: 4 (ta-market-analyst, ta-fundamentals-analyst, ta-news-sentiment-analyst, ta-risk-trader)

---

## FINAL SIGNAL: **[BUY/SELL/HOLD]** (from ta-risk-trader)

| Item | Value |
|------|-------|
| Entry Price | ... |
| Target Price | ... |
| Stop Loss | ... |
| Risk/Reward | ... |
| Position Sizing | ... |
| Timeframe | ... |
| Confidence | ... |

---

## Agent Conclusions

| Agent | Role | Conclusion |
|-------|------|-----------|
| ta-market-analyst | Technical | [방향] |
| ta-fundamentals-analyst | Fundamental | [등급] |
| ta-news-sentiment-analyst | News/Sentiment | [방향] |
| ta-risk-trader | Risk & Decision | [시그널 + 확신도] |

---

## 1. Technical Analysis
[01 요약 — 핵심 지표, 지지/저항, 방향]

## 2. Fundamentals Analysis
[02 요약 — 재무, 밸류에이션, 등급]

## 3. News/Sentiment Analysis
[03 요약 — 핵심 뉴스, 애널리스트 견해, 센티먼트]

## 4. Risk Assessment & Trading Decision
[04 요약 — 강세/약세 논거, 리스크, 트레이딩 플랜]

## 5. Final Synthesis
[네 관점을 아우르는 본인의 종합]

### Key Takeaway
[1-2문장]

### Data Gaps
[에이전트들이 확보 불가로 보고한 항목과 그것이 확신도를 어떻게 제한하는지]

### Critical Monitoring Points
[주시할 이벤트/가격대의 번호 목록]

---

## Sources
[모든 리포트의 출처 통합]

---

> **Disclaimer**: 이것은 공개 웹 소스에 기반한 AI 에이전트 리서치이며 투자 자문이
> 아니다. TradingAgents Python 파이프라인으로 생성된 것이 아니며 백테스트나 실현
> 수익 검증을 거치지 않았다. 모든 투자 결정의 책임은 본인에게 있다.
```

**Data Gaps** 섹션은 비어 있어도 유지하고 "none"이라고 써라. 조용히 빼먹으면 빈약한
분석이 완전해 보이게 된다.

### 4. 저장
```
Write: output/{TICKER}/{DATE}/05-final-report.md
```

## 검증 체크리스트

- [ ] `output/{TICKER}/{DATE}/`가 존재한다
- [ ] `01-technical-analysis.md`가 존재하고, 비어 있지 않으며, Technical Direction 라인으로 끝난다
- [ ] `02-fundamentals-analysis.md`가 존재하고, 비어 있지 않으며, Fundamental Rating 라인으로 끝난다
- [ ] `03-news-sentiment-analysis.md`가 존재하고, 비어 있지 않으며, Sentiment Direction 라인으로 끝난다
- [ ] `04-risk-trade-decision.md`가 존재하고, 비어 있지 않으며, FINAL SIGNAL 라인으로 끝난다
- [ ] `05-final-report.md`가 존재하고 종합 내용이 모두 담겨 있다
- [ ] 최종 리포트에 FINAL SIGNAL과 entry/target/stop이 있다
- [ ] Data Gaps 섹션이 있다 ("none"이라도)
- [ ] 태스크 5개가 모두 completed로 표시되었다

## 트러블슈팅

**에이전트가 리포트를 보냈지만 파일을 저장하지 않음** — 메시지에서 내용을 추출해
직접 올바른 경로에 `Write`한 뒤 계속 진행하라.

**에이전트가 완료하지 않고 유휴 상태가 됨** — 이름으로 `SendMessage`해서(메시지를 보내면
해당 에이전트가 자신의 트랜스크립트에서 재개된다) 출력 프로토콜을 상기시켜라. 그래도
응답하지 않으면 그 에이전트가 보낸 자료로 리포트를 작성하고 최종 리포트에 그 공백을 기록하라.

**ta-risk-trader가 입력 누락을 보고함** — 1–3이 끝나기 전에 스폰된 것이다. 세 파일을
검증한 뒤 다시 스폰하라.

**예전 런북의 `TeamCreate` / `TeamDelete` / `shutdown_request` 단계가 실패함** — 정상이다.
그 도구들은 사라졌으니 해당 단계를 건너뛰어라. 태스크 배정은 `TaskUpdate`의 `owner`로 하고,
백그라운드 에이전트는 셧다운이 필요 없다.
