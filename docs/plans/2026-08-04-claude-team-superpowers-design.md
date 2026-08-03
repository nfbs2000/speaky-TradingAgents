# Claude 트레이딩 팀 재구성 설계 (superpowers 기반)

**작성일**: 2026-08-04
**대상**: `.claude/` 런타임 트레이딩 팀
**전제**: LLM 프로바이더 API 키 없이 동작. 리포의 코드와 프로세스를 최대한 따른다.

---

## Goal

`.claude`의 런타임 트레이딩 팀을 리포(`tradingagents/`)의 실제 12-에이전트 프로세스에
맞춰 재구성하고, 산출물이 리포의 계약(5단계 rating, Pydantic 스키마, 메모리 로그)과
호환되게 만든다. 규율은 superpowers 스킬에서 가져오고, 성공 여부는 **증거 추적성**을
검사하는 pytest 게이트로 판정한다.

## 확정된 결정

| # | 결정 | 근거 |
|---|---|---|
| 1 | **계약까지 호환** | 리포의 `parse_rating` / Pydantic 스키마 / `TradingMemoryLog`를 재사용해 팀 판단을 사후 검증할 수 있게 한다. 이 코드는 전부 순수 Python이라 API 키가 필요 없다 |
| 2 | **성공 기준 = 증거 추적성** | 모든 수치가 리포 툴 호출에서 나왔음을 기계적으로 검사한다. 증거 없는 수치는 런 실패 |
| 3 | **핵심 계통 재현** (라운드 1) | 리포의 12 에이전트 계통을 전부 재현하되 토론 라운드는 기본값 1로 고정 |
| 4 | **애널리스트 4인 분리** | 리포는 market / sentiment / news / fundamentals 4개다. 현재 팀은 뉴스와 센티먼트를 겸해 어긋난다 |
| 5 | **Trader에게 애널리스트 리포트 제공** (divergence) | 리포 그대로면 `investment_plan`만 받는데 `TraderProposal.reasoning` 스키마가 요구하는 근거를 댈 수 없다 (리포 자체의 결함) |
| 6 | **단계별 툴 호출 + 호출 로그 보존** | 리포는 애널리스트가 자기 툴을 bind해 직접 호출한다. 증거 추적성을 위해 툴 출력 원본을 파일로 남긴다 |

---

## 설계를 결정한 조사 결과

### 발견 1 — 데이터 레이어 전체가 API 키 없이 동작한다

`tradingagents` 전체에서 자격증명을 읽는 곳은 두 곳뿐이다
(`dataflows/alpha_vantage_common.py:30`, `dataflows/fred.py:86`).
기본 벤더는 전부 yfinance (`default_config.py:133-140`).

**키 불필요 (11개)**: `get_stock_data`, `get_indicators`,
`get_verified_market_snapshot`, `get_fundamentals`, `get_balance_sheet`,
`get_cashflow`, `get_income_statement`, `get_news`, `get_global_news`,
`get_insider_transactions`, `get_prediction_markets`

**`__all__`에 없지만 sentiment_analyst가 직접 호출 (둘 다 키 불필요)**:
`fetch_stocktwits_messages` (`stocktwits.py:3-8`), `fetch_reddit_posts` (`reddit.py:14`)

**키 필요 (1개)**: `get_macro_indicators` — `FRED_API_KEY`. 없으면 크래시하지 않고
`DATA_UNAVAILABLE:` 센티넬 문자열을 반환한다 (`interface.py:253-259`, optional 카테고리).

현재 팀은 이 중 3개만 쓰고 재무제표·뉴스·내부자 거래·소셜을 웹 검색으로 대체했다.
그 결과 StockTwits 403 차단, Reddit 원문 미확보, SEC EDGAR 수동 조회가 발생했다.
**리포에 키 없이 동작하는 전용 페처가 있었는데 쓰지 않았다.**

### 발견 2 — 메모리/리플렉션 루프도 키 없이 재현 가능하다

- `store_decision()` — LLM 무관여 (`memory.py:30-49`)
- 실현 수익률 — 가격 데이터만. `alpha = raw - bench_ret`, 베타 조정 없음
  (`trading_graph.py:279-287`)
- 리플렉션만 LLM 필요 — **정확히 2~4문장 평문, 고정 3항목**
  (`reflection.py:20-29`). Claude 서브에이전트가 대체한다.

**함정**: CLI 경로(`cli/main.py:1120-1132`)는 `propagate()`를 건너뛰어 메모리·리플렉션·
체크포인트가 **전부 죽어 있다**. `--checkpoint` 플래그도 실효가 없다. 팀은 CLI를
모방하지 말고 `propagate()` 계약을 따라야 한다.

### 발견 3 — 정보 흐름이 의도적으로 좁다

- **Research Manager**는 애널리스트 리포트를 못 본다. 토론 히스토리만 (`research_manager.py:21-22`)
- **Portfolio Manager**도 리포트를 못 본다. 리스크 토론 히스토리 + 두 계획 + `past_context`만
- **Trader**는 `investment_plan`만 본다

버그가 아니라 설계다 — 토론이 정보를 압축하는 필터다. 팀도 이 좁은 흐름을 지킨다
(단 결정 5의 divergence는 예외).

### 리포 자체의 결함 2건 (팀에서 방어한다)

1. **Trader가 근거 없이 근거를 요구받는다** — 프롬프트(`trader.py:35`)와
   스키마(`schemas.py:135-137`)는 "애널리스트 리포트에 근거하라"고 하는데 실제 입력은
   `investment_plan`뿐 (`trader.py:27,47`). → 결정 5로 해소
2. **애널리스트 리포트가 빈 문자열로 통과할 수 있다** — 툴콜이 있는 턴에서는
   `report = ""`로 남고 (`market_analyst.py:87-88`), 저장 단계가 조용히 건너뛴다
   (`reporting.py:22-37`). → 증거 게이트에서 실패 처리

---

## 아키텍처

순서 집행은 **Workflow 스크립트**가 담당한다. LangGraph의 조건 분기와 라운드 카운터를
코드로 재현해 순서가 결정론적이 되게 한다. 대화형 경로는 스킬로 병행 유지한다.

```
산출물 위치: .claude/team-runs/{DATE}-{TICKER}/     ← 유일한 저장 위치

P0  repo tools (에이전트 아님, 저티어)         00-market-data.md
     get_verified_market_snapshot / get_stock_data / get_indicators

P1  애널리스트 4인 [병렬, 중티어]
     market       → 01-technical-analysis.md      (지표·OHLCV·거래량)
     sentiment    → 02-sentiment-analysis.md      (fetch_stocktwits_messages, fetch_reddit_posts)
     news         → 03-news-analysis.md           (get_news, get_global_news, get_macro_indicators)
     fundamentals → 04-fundamentals-analysis.md   (get_fundamentals, balance_sheet, cashflow, income_statement)
     리포는 순차지만 서로 안 읽으므로 병렬은 안전한 divergence (벽시계 시간 절감)

P2  Bull → Bear [순차, 반박, 중티어]           05-debate-history.md (누적)
     Bear는 마지막 블록(= Bull의 주장)을 current_response로 읽는다
     발언 접두사 "Bull Analyst: " / "Bear Analyst: " 는 리포의 라우팅 계약

P3  Research Manager [중티어]                  06-research-plan.md    → ResearchPlan (5단계 rating)
     입력: 05의 history만 (리포트 미제공)

P4  Trader [중티어]                            07-trader-proposal.md  → TraderProposal (3단계)
     입력: 06 + (divergence) 01~04

P5  Aggressive → Conservative → Neutral        08/09/10 + 11-risk-history.md
     [순차 회전, 중티어] 각자 다른 둘의 최신 발언을 본다
     라우팅은 접두사가 아니라 latest_speaker 필드

P6  Portfolio Manager [상위 티어]              12-portfolio-decision.md → PortfolioDecision (5단계)
     입력: 11의 history + 06 + 07 + past_context

P7  증거 게이트 (pytest)                       통과해야 런 성립
P8  메모리 기록 (LLM 무관여)                    store_decision() → trading_memory.md
P9  다음 런 시작 시 리플렉션                    pending 해소 → 실현 수익률 → 교훈 → past_context
```

에이전트 12개 = 애널리스트 4 + 토론자 2 + RM 1 + Trader 1 + 리스크 3 + PM 1. 리포와 동일.

### 모델 티어를 디스패치마다 명시한다

superpowers의 실측 근거: 디스패치에서 모델을 생략하면 세션의 가장 비싼 모델을 조용히
상속한다(어떤 실행에서 리뷰어 26명 전원이 최상위 티어에 올라간 사례). 동시에
**"턴 수가 토큰 단가를 이긴다"** — 가장 싼 모델은 다단계 작업에서 2~3배 턴을 쓴다.

→ P0 저티어 / P1~P5 중티어 / P6 상위 티어로 고정한다.

---

## 데이터 흐름 — state를 파일로 구현한다

리포는 `AgentState` 한 덩이를 노드가 주고받는다. 팀은 파일로 구현한다 — 컴팩션을 넘어
살아남고, 검증 가능하고, 재개 가능하다.

| 리포 state 키 | 팀의 대응 | 쓰는 쪽 → 읽는 쪽 |
|---|---|---|
| `market_report` 등 4개 | `01`~`04` | 애널리스트 → Bull/Bear, 리스크 3인 |
| `investment_debate_state.history` | `05-debate-history.md` (append) | Bull/Bear 교대 → Research Manager |
| `investment_debate_state.current_response` | 같은 파일의 **마지막 블록** | 단일 슬롯 교대 (리포와 동일) |
| `investment_plan` | `06-research-plan.md` | RM → Trader, PM |
| `trader_investment_plan` | `07-trader-proposal.md` | Trader → 리스크 3인, PM |
| `risk_debate_state` (채널 3개) | `08`~`10` + `11-risk-history.md` | 각자 append, 다른 둘의 최신을 읽음 |
| `final_trade_decision` | `12-portfolio-decision.md` | PM → 메모리 |
| `past_context` | `get_past_context()` 호출 결과 | 리포 함수 그대로 → **PM만** |

`InvestDebateState`는 6필드(`bull_history`, `bear_history`, `history`,
`current_response`, `judge_decision`, `count`), `RiskDebateState`는 10필드로
최신 발언 채널이 3개로 분리돼 있다 (`agent_states.py:8-44`).

---

## 계약

### 산출물 스키마 (`agents/schemas.py`)

| 단계 | 스키마 | rating 어휘 |
|---|---|---|
| Research Manager | `ResearchPlan` | `PortfolioRating` 5단계 `Buy/Overweight/Hold/Underweight/Sell` (`:44`) |
| Trader | `TraderProposal` | `TraderAction` 3단계 `Buy/Hold/Sell` (`:54`) |
| Portfolio Manager | `PortfolioDecision` | `PortfolioRating` 5단계 |
| Sentiment 애널리스트 | `SentimentReport` | `SentimentBand` (`:258`) |

rating 파싱은 `parse_rating` (`agents/utils/rating.py:28`).

### 메모리 로그의 grep 계약 (`agents/utils/memory.py`)

- 엔트리 구분자: `<!-- ENTRY_END -->` (LLM 프로즈에 나올 수 없는 HTML 주석)
- pending 태그: `[{trade_date} | {ticker} | {rating} | pending]`
- resolved 태그: `[{date} | {ticker} | {rating} | {raw:+.1%} | {alpha:+.1%} | {holding_days}d]`
- 본문 섹션: `DECISION:` + 나중에 붙는 `REFLECTION:`

**주의**: config에 `memory_log_path`가 없으면 모든 쓰기가 조용히 no-op이 된다
(`memory.py:20-24,38-39`).

---

## 실패 처리

### 원장 (ledger)

SDD의 실측 근거: *"자리를 잃은 컨트롤러가 완료된 태스크 시퀀스 전체를 재디스패치했다 —
관측된 가장 비싼 실패."* 2026-08-02 세션에서 같은 부류의 실패가 발생했다(경로 변경
메시지가 늦게 도착해 산출물이 구 디렉터리에 저장됨).

```
.claude/team-runs/{DATE}-{TICKER}/
├── progress.md          ← 원장. 첫 줄이 이 런을 지명. "Stage N: complete" 줄로 재개 지점 판정
├── 00-market-data.md ... 12-portfolio-decision.md
└── tool-calls/          ← 단계별 툴 호출 원본 출력 (증거 추적성의 근거)
```

원장의 첫 줄이 **다른 런을 지명하면 남의 진행상황**이므로 건드리지 않고 새로 시작한다.
컴팩션 후에는 자기 기억보다 원장과 파일을 믿는다.

### 단계별 처리

| 상황 | 처리 |
|---|---|
| 에이전트가 "완료" 보고 | **믿지 않는다.** `verification-before-completion`의 증거 표: 에이전트 완료 주장의 증거는 파일 diff이며 보고는 불충분 |
| 산출물이 계약 미달 | 같은 단계 재디스패치, **최대 5라운드**. 1~3라운드는 원래 에이전트 재개(컨텍스트 온전), 4~5는 상위 티어의 새 에이전트 |
| 5라운드 후에도 미달 | 서킷브레이커 — 항목별 판결(`parked` + 근거 / `BLOCKED` 후 사용자에게). **조용한 폐기 금지**, 모든 판결은 원장 항목 |
| 툴 호출 실패 | 리포의 센티넬 규약을 따른다 — optional 카테고리는 `DATA_UNAVAILABLE` 문자열로 진행, core는 중단 |
| 애널리스트 리포트가 빈 문자열 | 증거 게이트에서 실패 처리 (리포 결함을 팀에서 막는다) |

---

## 검증 — 증거 게이트

### grep 테스트를 쓰지 않는다

`writing-good-tests.md`의 **"문자열 존재 함정"**: 스크립트·프롬프트·문서에 대한 grep
스타일 테스트는 반증가능성을 위조한다. **관측 대상은 항상 행동이지 텍스트가 아니다.**

올바른 형태는 **행동 단정** — 테스트가 리포 툴을 다시 호출해 리포트의 숫자와 대조한다.

```python
def test_technical_report_numbers_match_repo_tools(run_dir):
    snapshot = get_verified_market_snapshot.invoke({...})   # 툴을 실제로 호출
    close = parse_close(snapshot)
    report_close = extract_claimed_close(run_dir / "01-technical-analysis.md")
    assert report_close == close        # 리포트가 툴과 어긋나면 실패
```

`test-driven-development`가 요구하는 대로 **테스트를 쓰기 전에 이 테스트를 실패시킬
변경을 명명한다** — 여기서는 "리포트의 종가를 한 자리 바꾸면 실패한다".

### 게이트가 검사하는 것

1. 모든 정확한 수치가 `tool-calls/`의 툴 출력에 매칭된다
2. `06`/`12`의 rating이 `parse_rating`을 통과하고 `PortfolioRating` 값이다
3. `07`의 action이 `TraderAction` 값이다
4. `06`/`07`/`12`가 각 Pydantic 스키마로 파싱된다
5. `01`~`04`가 비어 있지 않다 (리포 결함 2 방어)
6. 토론 파일에 양측 발언이 접두사와 함께 존재한다
7. entry/target/stop과 손익비가 산술적으로 일관된다

### RED은 이미 확보돼 있다

`test-driven-development`의 Iron Law는 "테스트가 실패하는 것을 직접 보지 않았다면 그것이
옳은 것을 테스트하는지 알 수 없다"이다. `.claude/team-runs/2026-08-02-NVDA/`에 이 게이트를
돌리면 실패한다 — 5단계 rating 산출물이 없고, 소셜 수치가 리포 페처가 아니라 제3자
집계에서 왔고, 펀더멘털이 SEC 웹에서 왔다. **진짜 RED이 공짜로 확보된다.**

---

## superpowers 매핑

조사 결과 **전용 적대적 검증/레드팀/데블스애드버킷 스킬은 없다.** 강세론 대 약세론
구조는 아래 재료로 직접 만든다.

| superpowers 스킬 | 붙는 자리 | 비고 |
|---|---|---|
| `test-driven-development` | 증거 게이트 | 행동 단정으로 작성. RED은 2026-08-02 런으로 확보 |
| `verification-before-completion` | 매 단계 오케스트레이터 | 4.3→6.2 게이트 함수·증거 표 무변경, 그대로 이식 |
| `dispatching-parallel-agents` | P1 애널리스트 4인 | 한 응답에 4개 호출 = 병렬. 서로 다른 파일을 쓰므로 SDD의 "구현자 병렬 금지"에 안 걸림 |
| `subagent-driven-development` | 오케스트레이션 골격 | 원장 + 5라운드 상한 + 서킷브레이커 + 디스패치마다 모델 명시 |
| `writing-skills` | 새 스킬 작성 | 아래 별도 규칙 |
| `requesting/receiving-code-review` | **구현 코드에만** | 우리가 만드는 스크립트·워크플로 리뷰용. 분석 리포트 리뷰용이 **아니다** |
| `systematic-debugging` | 게이트 실패 시 | 원인 추적 |
| `writing-plans` / `executing-plans` | 구현 계획 | 6.2.0은 배치 체크포인트 삭제 — 블로커에서만 멈추고 연속 실행 |

### 분석 리포트에 리뷰 서브에이전트를 추가하지 않는다

v5.0.6의 실측: **서브에이전트 문서 리뷰가 인라인 자기검토보다 품질을 개선하지 못했다**
(5버전 × 5시행 동일 점수, 25분 오버헤드). 따라서 리포트 검증은 pytest 게이트 +
인라인 자기검토로 하고, 별도 리뷰 에이전트를 붙이지 않는다.

---

## 새 스킬 작성 규칙

`writing-skills`의 **Match the Form to the Failure**: 지시를 쓰기 전에 베이스라인 실패를
분류한다.

2026-08-02 세션의 실패는 **"순응하지만 출력의 형태가 틀리다"**였다 — 에이전트들은
성실히 일했지만 경로를 틀렸고 필수 요소를 빠뜨렸다. 이 부류에 맞는 형태는
**긍정 레시피/계약(출력이 무엇인지를 부분과 순서로 명시)**이고, **틀린 형태는 금지 목록**이다.

측정된 역효과가 있다 — 경합 인센티브 아래서 금지 팔이 레시피 팔보다 원치 않는 내용을
더 많이 산출했고 **무지침 대조군보다도 나빴다.** 뉘앙스 조항과 예외 조항도 협상을
재개시킨다.

```
출력 계약 (이 순서대로, 이 슬롯을 채운다):
  1. Write → {RUN_DIR}/01-technical-analysis.md
  2. tool-calls/01-*.txt 에 툴 호출 원본 출력
  3. 판정 라인 → ## Technical Direction: **[...]**
  4. 반환 → {file, verdict, tool_calls: [...]}
```

### description에 워크플로를 요약하지 않는다

실측 사례: description에 `"code review between tasks"`라고 쓰자 에이전트가 리뷰를
**한 번만** 했고, 본문 플로차트는 두 번(스펙 → 품질)을 명확히 보여주고 있었다.
description을 워크플로 요약 없이 바꾸자 제대로 따랐다.

→ description은 **언제 쓰는지만** 3인칭으로, 프로세스 요약 금지.

---

## 리포와 의도적으로 다른 점 (divergence)

산출물에 명시한다.

| # | divergence | 이유 |
|---|---|---|
| 1 | 애널리스트 4인을 **병렬** 실행 | 리포는 순차지만 서로의 출력을 읽지 않으므로 논리가 깨지지 않는다. 벽시계 시간 절감 |
| 2 | Trader에게 애널리스트 리포트 제공 | 리포의 결함(스키마가 요구하는 근거를 댈 수 없음) 해소 |
| 3 | 리플렉션을 Claude 서브에이전트가 수행 | 리포는 `quick_thinking_llm` 사용. 프롬프트 계약(2~4문장, 고정 3항목)은 그대로 |
| 4 | 상태를 파일로 구현 | LangGraph state 대신. 검증·재개·컴팩션 생존 |
| 5 | 증거 게이트(pytest) 추가 | 리포에 없는 단계 |

## 범위 밖

- **프로바이더 심** — 리포의 LangGraph를 실제로 실행하고 LLM 레이어만 교체하는 안.
  프로세스 충실도는 완벽하지만 `tradingagents/`에 프로바이더 코드를 추가해야 하고
  576개 테스트 베이스라인에 영향이 가며, "이건 파이프라인이 아니다"라는 경계가 사라진다.
- **백테스트 성능 검증** — 계약 호환으로 가능해지지만 표본 확보에 수십 회 런이 필요하다.
  이번 범위는 증거 추적성까지.
- **superpowers 코어에 트레이딩 스킬 기여** — 플러그인의 `CLAUDE.md`가 도메인 특화
  스킬은 코어에 속하지 않는다고 명시. 이 리포의 `.claude/`에 유지한다.

## 남은 위험

1. **스키마 종속** — `agents/schemas.py`가 바뀌면 팀 산출물이 계약을 위반한다.
   증거 게이트가 이를 잡지만, 리포 업데이트 후에는 게이트를 먼저 돌려야 한다.
2. **`memory_log_path` 미설정 시 조용한 no-op** — 메모리 기록이 사라진다.
   P8에서 경로 존재를 명시적으로 확인한다.
3. **OHLCV 캐시가 오늘 날짜를 포함** (`stockstats_utils.py:174-177`) — 날짜가 넘어가면
   캐시 미스. 오프라인 부분 동작은 같은 날에만 가능하다.
4. **`get_macro_indicators`만 FRED 키 필요** — 없으면 센티넬로 진행되지만 매크로 맥락이
   빠진다. 게이트에서 실패로 보지 않고 Data Gaps로 기록한다.
