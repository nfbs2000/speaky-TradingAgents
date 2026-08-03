---
name: ta-team-analysis
description: 사용자가 "run trading analysis", "analyze stock with team", "team trading analysis", "run TLRY analysis", "stock analysis team", "trading team report", "multi-agent stock analysis", "run team analysis for [TICKER]", "종목 분석 팀 실행" 등을 요청하거나, Claude Code 서브에이전트로 구동되고 리포트를 자동 저장하는 멀티 에이전트 트레이딩 분석을 원할 때 사용하는 스킬.
version: 2.0.0
---

# 트레이딩 팀 분석

저장소의 12-에이전트 계통을 Claude Code 서브에이전트로 재현해 한 종목을 분석하고,
모든 산출물을 `.claude/team-runs/{DATE}-{TICKER}/`에 저장한다. 산출물은 pytest 증거
게이트를 통과해야 런으로 성립한다.

설계 근거: `docs/plans/2026-08-04-claude-team-superpowers-design.md`

## 세 가지 철칙

**1. 계산은 저장소 툴이 한다.** 가격·지표·재무제표·뉴스·내부자거래·소셜은
`tradingagents`의 데이터 툴을 호출해서 얻는다. 기본 벤더 설정에서 이 툴들은
**API 키를 요구하지 않는다**. Claude가 하는 일은 그 숫자의 해석, 논증, 리스크
판단, 서술이다.

**2. 저장 위치는 `.claude/team-runs/{DATE}-{TICKER}/` 하나뿐이다.**

**3. 증거 게이트를 통과해야 런이다.** 리포트의 수치는 `tool-calls/` 로그의 툴 출력과
대조된다. 로그에 없는 숫자는 지어낸 것으로 간주된다.

## 실행 방법

```
# 원샷 (권장) — 순서·라운드·복구가 코드로 집행된다
Workflow(name: "ta-team-run", args: {ticker: "NVDA", date: "2026-08-04"})

# 대화형 — 아래 절차를 직접 진행한다
```

## 사전 조건

- 서브에이전트 스폰 가능(`Agent`), 서브에이전트가 `Bash` / `WebSearch` / `WebFetch` 사용 가능
- 저장소 Python: `.venv/bin/python`(있으면) 또는 `python3`. `tradingagents` 임포트가
  실패하면 `pip install -e .` 후 재시도
- LLM 프로바이더 API 키는 **필요 없다**. `get_macro_indicators`만 FRED 키를 쓰는데,
  없으면 `DATA_UNAVAILABLE:` 센티넬을 돌려주고 런은 계속된다

## 파이프라인

리포의 노드 배선(`graph/setup.py:99-154`)과 토론 제어(`graph/conditional_logic.py:52-72`)를
그대로 따른다. 토론 라운드는 리포 기본값 1이다 — Bull 1회 + Bear 1회, 리스크 3인 각 1회.

| 단계 | 에이전트 | 산출물 | 입력 |
|---|---|---|---|
| P0 | (스크립트) | `00-market-data.md`, `tool-calls/` | 저장소 데이터 툴 |
| P1 | `ta-market-analyst` | `01-technical-analysis.md` | 툴 출력 + 웹(해석용) |
| P1 | `ta-sentiment-analyst` | `02-sentiment-analysis.md` | `fetch_stocktwits_messages`, `fetch_reddit_posts` |
| P1 | `ta-news-analyst` | `03-news-analysis.md` | `get_news`, `get_global_news`, `get_macro_indicators` |
| P1 | `ta-fundamentals-analyst` | `04-fundamentals-analysis.md` | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement`, `get_insider_transactions` |
| P2 | `ta-bull-researcher` | `05-debate-history.md` (append) | `01`~`04` |
| P2 | `ta-bear-researcher` | `05-debate-history.md` (append) | `01`~`04` + **Bull의 직전 주장** |
| P3 | `ta-research-manager` | `06-research-plan.md` | **`05`만** |
| P4 | `ta-trader` | `07-trader-proposal.md` | `06` + `01`~`04` (divergence) |
| P5 | `ta-aggressive-analyst` | `08-aggressive.md` + `11-risk-history.md` | `01`~`04` + `07` + `11` |
| P5 | `ta-conservative-analyst` | `09-conservative.md` + `11` | 위와 동일 |
| P5 | `ta-neutral-analyst` | `10-neutral.md` + `11` | 위와 동일 |
| P6 | `ta-portfolio-manager` | `12-portfolio-decision.md` | **`11`** + `06` + `07` + past_context |
| P7 | (pytest) | 게이트 판정 | `tests/test_claude_team_artifacts.py` |

**P1은 병렬**이다 — 애널리스트끼리 서로의 리포트를 읽지 않는다. 리포는 순차로 돌리지만
논리가 깨지지 않으므로 의도적 divergence다.

**P2와 P5는 순차**다. Bear는 Bull의 직전 주장을 읽고 반박하며(리포에서
`current_response` 단일 슬롯 교대), 리스크 3인은 `Aggressive → Conservative → Neutral`
회전 순서를 지킨다. 병렬로 돌리면 반박이 사라져 토론이 아니게 된다.

**P3과 P6은 좁게 본다.** Research Manager는 토론 히스토리만, Portfolio Manager는
리스크 히스토리와 두 계획만 읽는다 — 리포의 의도된 설계이며 토론이 정보를 압축하는
필터 역할을 한다.

## 계약

세 파일은 리포의 Pydantic 스키마로 검증된다. 형식이 계약이다.

| 파일 | 스키마 | rating 어휘 |
|---|---|---|
| `06-research-plan.md` | `ResearchPlan` | 5단계 `Buy/Overweight/Hold/Underweight/Sell` |
| `07-trader-proposal.md` | `TraderProposal` | 3단계 `Buy/Hold/Sell` |
| `12-portfolio-decision.md` | `PortfolioDecision` | 5단계 |

각 파일은 `<!-- SCHEMA:이름 {json} -->` 페이로드 블록으로 시작하고, 그 아래 마크다운
본문은 리포의 `render_*` 함수 출력과 **문자 단위로 일치**해야 한다
(`tradingagents/agents/schemas.py`).

애널리스트 리포트는 판정 라인으로 끝난다:
`## Technical Direction:` / `## Sentiment Direction:` / `## News Direction:` /
`## Fundamental Rating:`

## 실행 절차 (대화형)

### Step 0 — P0

```bash
PY=.venv/bin/python; [ -x "$PY" ] || PY=python3
"$PY" .claude/skills/ta-team-analysis/scripts/repo_market_data.py {TICKER} {DATE} .claude/team-runs/{DATE}-{TICKER}
```

stdout의 `verified close`와 `latest verified row`로 `{PRICE}`를 만든다. **웹 검색으로
가격 앵커를 만들지 않는다.** exit 3이면 `pip install -e .` 후 1회 재시도하고, 그래도
실패하면 degraded run으로 진행하되 모든 산출물에 명시한다.

그다음 원장을 만든다 — 첫 줄이 이 런을 지명해야 한다:

```
run: {DATE}-{TICKER}
Stage P0: complete
```

### Step 1~6 — 단계별 디스패치

각 에이전트에 넘기는 것은 실행별 변수뿐이다. 에이전트가 어떻게 일하는지는
`.claude/agents/ta-*.md`가 단일 출처이므로 여기서 다시 지시하지 않는다.

```
TICKER: {TICKER}
PRICE: {PRICE}
DATE: {DATE}
OUTPUT_DIR: .claude/team-runs/{DATE}-{TICKER}
TOOL_CALLS_DIR: .claude/team-runs/{DATE}-{TICKER}/tool-calls
TASK_ID: <배정한 task>
REPORT_TO: main
스테이지명: <P1-market 등>
```

**모델 티어를 디스패치마다 명시한다.** 생략하면 세션의 가장 비싼 모델을 조용히
상속한다. P0는 저티어, P1~P5는 중티어, P6는 상위 티어.

**다음 단계로 넘어가기 전에 파일을 직접 확인한다.** 에이전트의 "완료했습니다"는
주장이지 증거가 아니다 — 파일 존재와 판정 라인을 `Read`/`Glob`으로 확인한 뒤에만
진행한다.

### Step 7 — 증거 게이트

```bash
TEAM_RUN_DIR=.claude/team-runs/{DATE}-{TICKER} .venv/bin/python -m pytest tests/test_claude_team_artifacts.py -q
```

실패하면 담당 스테이지의 에이전트를 재디스패치한다. **최대 5라운드** — 1~3라운드는
같은 에이전트, 4~5라운드는 상위 티어. 5라운드를 넘기면 판결을 원장에 남기고
(`BLOCKED` 또는 `parked` + 근거) 사용자에게 올린다. 조용히 넘어가지 않는다.

게이트가 red인 런의 산출물은 파이프라인 비교나 메모리 기록에 쓰지 않는다.

## 검증 체크리스트

- [ ] 모든 파일이 `.claude/team-runs/{DATE}-{TICKER}/`에 있다
- [ ] `tool-calls/`에 툴 호출 원본 출력이 있다
- [ ] `progress.md` 첫 줄이 이 런을 지명한다
- [ ] `01`~`04`가 각자의 판정 라인으로 끝난다
- [ ] `05`에 `Bull Analyst:`와 `Bear Analyst:`가 그 순서로 있다
- [ ] `11`에 `Aggressive Analyst:` → `Conservative Analyst:` → `Neutral Analyst:` 순서로 있다
- [ ] `06`/`07`/`12`가 SCHEMA 블록을 갖고 본문이 `render_*` 출력과 일치한다
- [ ] pytest 증거 게이트가 통과한다

## 트러블슈팅

**러너가 `REPO TOOLS UNAVAILABLE`** — `pip install -e .` 후 재시도. 실패하면
degraded run으로 진행하고 모든 산출물에 명시한다.

**`get_news`가 비어 있다** — 해당 기간 yfinance 뉴스가 없는 것이다. 뉴스 애널리스트가
웹 검색으로 보완하고 툴 공백을 Data Gaps에 기록한다.

**`get_macro_indicators`가 `DATA_UNAVAILABLE`** — FRED 키가 없는 정상 경로다.
게이트 실패로 보지 않고 Data Gaps에 기록한다.

**Reddit이 HTTP 429** — 레이트리밋이다. 확보된 서브레딧만으로 진행하고 표본 크기를
밝힌다.

**게이트가 SCHEMA 블록을 못 찾음** — 해당 단계 에이전트가 JSON 페이로드를 빠뜨린
것이다. 재디스패치하고, 본문이 `render_*` 출력과 문자 단위로 일치하는지 확인한다.

**에이전트가 유휴 상태로 멈춤** — 이름으로 `SendMessage`해 출력 계약을 상기시킨다.
응답이 없으면 받은 자료로 산출물을 만들고 그 공백을 기록한다.
