# .claude/workflows — 트레이딩 실행

트레이딩 분석을 실행하는 워크플로. 저장소의 12-에이전트 계통을 Claude Code
서브에이전트로 재현하고, 순서·라운드·복구를 코드로 집행한다.

설계 근거: `docs/plans/2026-08-04-claude-team-superpowers-design.md`

| 워크플로 | 용도 |
|---|---|
| `ta-team-run.js` | **단일 종목**: 저장소 툴 → 애널리스트 4인 → Bull/Bear → RM → Trader → 리스크 3인 → PM → 증거 게이트 |
| `ta-watchlist-run.js` | **워치리스트**: 여러 종목에 `ta-team-run`을 돌리고 5단계 등급으로 랭킹 |

## 세 가지 철칙

**계산은 저장소 툴이 한다.** 가격·지표·재무제표·뉴스·내부자거래·소셜은
`tradingagents`의 데이터 툴에서 나온다. 기본 벤더 설정에서 API 키가 필요한 툴은
`get_macro_indicators`(FRED) 하나뿐이고, 키가 없으면 `DATA_UNAVAILABLE` 센티넬로
진행된다. LLM 프로바이더 키는 필요 없다.

**저장 위치는 `.claude/team-runs/{RUN_LABEL}/` 하나뿐이다.**

**증거 게이트를 통과해야 런이다.** 리포트의 수치는 `tool-calls/` 로그와 대조된다.

## 단일 종목

```
Workflow(name: "ta-team-run", args: {ticker: "NVDA", date: "2026-08-01"})
# 선택: context: "검증할 논지"
#      run_label: "2026-08-04-NVDA"   ← 산출물 디렉터리 이름
```

`date`는 **분석 기준일**, `run_label`은 **산출물 디렉터리 이름**이다. 기본값이
`{date}-{ticker}`이므로 같은 분석일을 다시 돌리면 이전 런을 덮어쓴다 — 재실행에서는
`run_label`에 실행 날짜를 넘겨라. P0의 원장 가드가 `progress.md` 첫 줄이 다른 런을
지명하면 멈추지만, 디렉터리 이름을 먼저 갈라두는 것이 안전하다.

산출물 (14개 + 툴 로그):

```
00-market-data.md                 저장소 툴 출력 정리본
01-technical-analysis.md          Technical Direction
02-sentiment-analysis.md          Sentiment Direction
03-news-analysis.md               News Direction
04-fundamentals-analysis.md       Fundamental Rating
05-debate-history.md              Bull → Bear (순차 반박)
06-research-plan.md               ResearchPlan     (5단계 rating)
07-trader-proposal.md             TraderProposal   (3단계 Buy/Hold/Sell)
08-aggressive.md / 09-conservative.md / 10-neutral.md
11-risk-history.md                Aggressive → Conservative → Neutral (순차 회전)
12-portfolio-decision.md          PortfolioDecision (5단계 rating) ← 최종 판정
progress.md                       원장. 첫 줄이 이 런을 지명한다
tool-calls/                       모든 툴 호출 원본 출력
```

## 워치리스트

```
Workflow(name: "ta-watchlist-run", args: {tickers: ["NVDA", "AMD", "AVGO"], date: "2026-08-01"})
# 선택: run_label_suffix: "2026-08-04"  ← {suffix}-{TICKER} 로 디렉터리를 만든다
```

종목당 에이전트 16개 내외가 돌므로 한 번에 2~3종목을 권장한다. **게이트를 통과하지
못한 종목은 랭킹에서 제외되고 별도 섹션에 보고된다** — 증거가 검증되지 않은 등급을
다른 종목과 나란히 세우면 랭킹 자체가 거짓 판독이 되기 때문이다.

랭킹 규칙(코드로 고정): degraded run 후순위 → 5단계 등급 `Buy → Sell` 순 →
미확보 툴이 적은 순.

## 수정한 워크플로를 실행할 때

`Workflow(name: ...)`는 세션 시작 시점의 스크립트를 해석한다. 파일을 고친 뒤에는
**`scriptPath`로 실행해야** 수정본이 반영된다.

```
Workflow(scriptPath: ".claude/workflows/ta-team-run.js", args: {...})
```

같은 이유로 새로 만든 에이전트 정의도 세션 중에는 워크플로 러너에 늦게 등록될 수
있다. 에이전트 타입이 없다는 오류가 나면 그 문제다.

## 실패 처리

| 상황 | 처리 |
|---|---|
| 에이전트가 "완료" 보고 | 믿지 않는다. 파일 존재를 직접 확인한다 |
| 게이트 실패 | 담당 스테이지 재디스패치, **최대 5라운드**. 1~3라운드는 같은 에이전트, 4~5는 상위 티어 |
| 5라운드 초과 | 서킷브레이커 — 판결을 `progress.md`에 남기고 멈춘다. 조용히 넘어가지 않는다 |
| 툴 호출 실패 | optional 카테고리는 센티넬로 진행, core는 중단 |

## 모델 티어

디스패치마다 명시한다. 생략하면 세션의 가장 비싼 모델을 조용히 상속하고, 반대로
최하위로 몰면 턴 수가 늘어 오히려 비싸진다. P0는 저티어, 애널리스트·토론자는
중티어, Portfolio Manager는 상위 티어.

## 예약 실행

`/schedule`로 cloud agent를 만들고 프롬프트에 `Workflow`를 태운다. `date`와
`run_label`은 실행 시점의 날짜로 채워 넘긴다 — 스크립트는 시계를 읽을 수 없다.

---

> 산출물은 공개 웹 소스와 저장소 툴 출력에 기반한 AI 리서치이며 투자 자문이 아니다.
> 5단계 등급은 리포의 `PortfolioRating` 어휘를 따르지만 이 팀런은 Python LangGraph
> 전체 파이프라인 실행이 아니다. 백테스트·실현 수익 검증이 없다.
