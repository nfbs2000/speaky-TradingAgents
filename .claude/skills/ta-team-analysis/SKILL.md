---
name: ta-team-analysis
description: 사용자가 "run trading analysis", "analyze stock with team", "team trading analysis", "run TLRY analysis", "stock analysis team", "trading team report", "multi-agent stock analysis", "run team analysis for [TICKER]", "종목 분석 팀 실행" 등을 요청하거나, Claude Code 서브에이전트로 구동되고 리포트를 자동 저장하는 멀티 에이전트 트레이딩 분석을 원할 때 사용하는 스킬.
version: 1.0.0
---

# 트레이딩 팀 분석

Claude Code 서브에이전트 팀으로 종목을 분석하고, 모든 산출물을
`.claude/team-runs/{DATE}-{TICKER}/`에 저장한다.

## 두 가지 철칙

**1. 계산은 저장소 툴이 한다.** 가격, 이동평균, RSI, MACD, Bollinger, ATR,
거래량, 기준일 검증 — 전부 `tradingagents`의 `@tool`을 호출해서 얻는다.
Claude가 대신 계산하거나 웹에서 주워오지 않는다. Claude가 하는 일은 그 숫자의
해석, 논증, 리스크 판단, 서술이다.

**2. 저장 위치는 `.claude/team-runs/{DATE}-{TICKER}/`다.** `output/`이 아니다.
이 디렉터리가 팀런의 유일한 기록이다.

## 사전 조건

- 서브에이전트 스폰 가능(`Agent`), 서브에이전트가 `WebSearch` / `WebFetch` 사용 가능
- 저장소 Python: `.venv/bin/python`(있으면) 또는 `python3`. `tradingagents` 임포트가
  실패하면 `pip install -e .` 후 재시도
- LLM 프로바이더 API 키는 **필요 없다**

## 입력 변수

| 변수 | 설명 | 예시 |
|---|---|---|
| `{TICKER}` | 티커 심볼 | `NVDA` |
| `{DATE}` | 분석 날짜 (YYYY-MM-DD), 기본 오늘 | `2026-08-01` |

파생:
- `{RUN_DIR}` = `.claude/team-runs/{DATE}-{TICKER}`
- `{MARKET_DATA}` = `{RUN_DIR}/00-market-data.md` (P0가 생성)
- `{PRICE}` = P0가 출력한 `verified close` + 그 기준일. **웹 검색으로 가격 앵커를
  만들지 마라** — 지난 런에서 웹 앵커(~$197)가 하루 지난 세션 값이었고 하류 레벨과
  손익비를 통째로 오염시킬 뻔했다. P0가 실패한 경우에만 `unknown`을 넘긴다.

## 산출물

```
.claude/team-runs/{DATE}-{TICKER}/
├── 00-market-data.md              ← P0: 저장소 @tool 3개 출력 (LLM 무관여)
├── 01-technical-analysis.md       ← ta-market-analyst
├── 02-fundamentals-analysis.md    ← ta-fundamentals-analyst
├── 03-news-sentiment-analysis.md  ← ta-news-sentiment-analyst
├── 04-risk-trade-decision.md      ← ta-risk-trader
└── 05-final-report.md             ← 오케스트레이터
```

## Step 0 (P0) — 저장소 툴로 시장 데이터 확정

```bash
PY=.venv/bin/python   # 없으면 python3
$PY .claude/skills/ta-team-analysis/scripts/repo_market_data.py \
    {TICKER} {DATE} .claude/team-runs/{DATE}-{TICKER}/00-market-data.md
```

이 러너는 계산 로직을 갖지 않는다. 저장소의 `@tool` 세 개를 호출하고 출력을
그대로 이어붙일 뿐이며, 이는 제품의 `market_analyst`가 쓰는 바로 그 툴이다:

| 툴 | 역할 |
|---|---|
| `get_verified_market_snapshot` | 최신 검증 OHLCV 행 + 지표 + 최근 종가 — 제품이 지정한 source of truth |
| `get_stock_data` | 설정된 벤더 경유 OHLCV 시계열 (거래량 포함) |
| `get_indicators` | 저장소 상수 `DEFAULT_SNAPSHOT_INDICATORS` 지표별 30일 히스토리 |

지표 목록도 저장소 상수를 그대로 쓴다. **러너에 pandas 가공이나 자체 지표 계산을
추가하지 마라** — 그런 변경이 필요하면 `tradingagents/`에 넣을 일이지 러너의 일이
아니다.

결과 처리:
- exit 0 → stdout의 `verified close` / `latest verified row`로 `{PRICE}`를 만든다.
  파일에 `STALE OHLCV WARNING`이 있으면 디스패치 변수에 그대로 전달한다.
- exit 3 → `pip install -e .` 후 1회 재시도. 그래도 실패하면 **web-only degraded
  run**: `MARKET_DATA: none (repo tools unavailable: <이유>)`, `PRICE: unknown`으로
  진행하고 모든 산출물에 명시한다.

00 파일은 손으로 고치지 마라. 값이 이상하면 그것 자체가 발견이므로 기록한다.

## Step 1 — 태스크 생성

`TaskCreate`로 5개를 만들고 `TaskUpdate`로 배선한다:

| # | Subject | Owner |
|---|---|---|
| 1 | Technical analysis for {TICKER} | ta-market-analyst |
| 2 | Fundamentals analysis for {TICKER} | ta-fundamentals-analyst |
| 3 | News/sentiment analysis for {TICKER} | ta-news-sentiment-analyst |
| 4 | Risk assessment & trading decision for {TICKER} | ta-risk-trader |
| 5 | Final synthesis report for {TICKER} | 오케스트레이터 |

- task 4: `addBlockedBy: ["1","2","3"]`
- task 5: `addBlockedBy: ["1","2","3","4"]`

## Step 2 — 애널리스트 3명 병렬 스폰

`ta-market-analyst`, `ta-fundamentals-analyst`, `ta-news-sentiment-analyst`를
**하나의 메시지에서 `Agent` 호출 3개로** 띄운다. `team_name`은 넘기지 마라 (무시된다).

디스패치 프롬프트는 실행별 변수가 전부다. 에이전트가 어떻게 일하는지는
`.claude/agents/ta-*.md`가 단일 출처이므로 여기서 다시 지시하지 마라:

```
TICKER: {TICKER}
PRICE: {PRICE}                     # P0의 verified close; degraded run만 "unknown"
DATE: {DATE}
OUTPUT_DIR: {RUN_DIR}              # .claude/team-runs/{DATE}-{TICKER}
MARKET_DATA: {MARKET_DATA}         # 또는 "none (repo tools unavailable: ...)"
TASK_ID: <배정한 task>
REPORT_TO: main
```

## Step 3 — 1–3 검증 후 ta-risk-trader 스폰

세 완료 알림을 받고 **파일 존재·비어있지 않음·판정 라인을 직접 확인**한 뒤에만
같은 디스패치 변수로 `ta-risk-trader`를 띄운다:

```bash
grep -l "## Technical Direction:" {RUN_DIR}/01-technical-analysis.md
grep -l "## Fundamental Rating:" {RUN_DIR}/02-fundamentals-analysis.md
grep -l "## Sentiment Direction:" {RUN_DIR}/03-news-sentiment-analysis.md
```

에이전트의 "완료했습니다"는 주장이지 증거가 아니다.

## Step 4 — 최종 종합

`04`의 `## FINAL SIGNAL:` 라인까지 확인한 뒤 00–04를 모두 읽고
`{RUN_DIR}/05-final-report.md`를 작성한다:

```markdown
# {TICKER} Comprehensive Trading Report

**Date**: {DATE} | **Price**: {PRICE} | **Agents**: 4 + repo-tool market data

## FINAL SIGNAL: **[BUY/SELL/HOLD]** (from ta-risk-trader)

| Item | Value |
|------|-------|
| Entry Price / Target / Stop | ... |
| Risk/Reward | ... |
| Position Sizing / Timeframe / Confidence | ... |

## Repo-Tool Market Data (no LLM)
[00에서 가져온 핵심 값: verified close + 기준일, 50/200 SMA, RSI, MACD,
Bollinger, ATR, 최근 거래량. 웹 불일치는 "web source mismatch"로 요약]

## Agent Conclusions
[4행 표: 에이전트 / 역할 / 판정]

## 1~4. [각 리포트 요약]

## 5. Final Synthesis
### Key Takeaway
### Data Gaps          ← 비어도 "none"이라고 쓴다
### Critical Monitoring Points

## Sources
[첫 줄은 00 — 저장소 @tool 출력]

> **Run boundary**: 이번 실행은 Python LangGraph 전체 파이프라인이 아니다.
> 가격·지표는 저장소의 공식 `@tool`(`get_verified_market_snapshot`,
> `get_stock_data`, `get_indicators`)로 확정했고, Claude 팀은 그 결과를 해석·
> 종합했다. AI 리서치이며 투자 자문이 아니고, 백테스트·실현 수익 검증이 없다.
```

degraded run이면 Run boundary를 "저장소 툴 호출이 실패해 수치가 웹 출처뿐이다
(<이유>). 지표 신뢰도는 그만큼 낮다"로 바꾼다.

## 검증 체크리스트

- [ ] 모든 파일이 `.claude/team-runs/{DATE}-{TICKER}/`에 있다 (`output/`이 아니다)
- [ ] `00-market-data.md`에 세 툴 섹션과 verified close·기준일이 있다
- [ ] `{PRICE}`가 웹이 아니라 00의 verified close에서 나왔다
- [ ] 01–03이 각자의 판정 라인으로 끝난다
- [ ] 01의 지표 수치가 00과 일치한다
- [ ] 04에 FINAL SIGNAL이 있고 entry/target/stop이 verified close 기준으로 산술 일관이다
- [ ] 05에 Repo-Tool Market Data 섹션, Data Gaps, Run boundary가 있다
- [ ] 태스크 5개가 completed다

## 트러블슈팅

**러너가 `REPO TOOLS UNAVAILABLE`** — `pip install -e .` 후 재시도. 그래도 안 되면
degraded run으로 진행하고 모든 산출물에 명시한다.

**00과 웹 출처가 다름** — 00이 이긴다. 웹 값은 "web source mismatch"로 기록만.
`STALE OHLCV WARNING`이 있으면 둘 다 신뢰도 낮음으로 다룬다.

**에이전트가 파일을 저장하지 않음** — 메시지 내용을 추출해 직접 올바른 경로에
`Write`한다.

**에이전트가 유휴 상태로 멈춤** — 이름으로 `SendMessage`해 출력 프로토콜을 상기시킨다.
응답이 없으면 받은 자료로 리포트를 쓰고 그 공백을 05에 기록한다.

**ta-risk-trader가 입력 누락 보고** — 1–3 완료 전에 띄운 것이다. 검증 후 다시 띄운다.
