# .claude/workflows — 트레이딩 실행

트레이딩 분석을 실행하는 워크플로. `Workflow(name: "...", args: {...})`로 호출한다.
둘 다 같은 구조를 따른다: **가격·지표 계산은 저장소 `@tool`이, 해석·논증·서술은
Claude 에이전트가** 한다. LLM provider API 키는 필요 없다.

| 워크플로 | 용도 |
|---|---|
| `ta-team-run.js` | **단일 종목**: 저장소 툴 → 애널리스트 3명 병렬 → 리스크 트레이더 → 05 최종 리포트 |
| `ta-watchlist-run.js` | **워치리스트**: 여러 종목에 ta-team-run을 돌리고 시그널·신뢰도·손익비로 랭킹 |

## 단일 종목

```
Workflow(name: "ta-team-run", args: {ticker: "NVDA", date: "2026-08-01"})
# 선택: context: "검증할 논지"
#      run_label: "2026-08-04-NVDA"  ← 산출물 디렉터리 이름
```

`date`는 **분석 기준일**이고 `run_label`은 **산출물 디렉터리 이름**이다. 기본값은
`{date}-{ticker}`이므로 같은 분석일을 다시 돌리면 이전 런 디렉터리를 덮어쓴다 —
재실행에서는 `run_label`에 실행 날짜를 넘겨라. P0의 원장 가드가 `progress.md` 첫 줄이
다른 런을 지명하면 멈추지만, 디렉터리 이름을 먼저 갈라두는 것이 안전하다.

산출물: `.claude/team-runs/{DATE}-{TICKER}/00…05*.md` — **이 디렉터리가 유일한
저장 위치다.** 최종 시그널은 `BUY/SELL/HOLD` + 신뢰도 + entry/target/stop
(verified close 기준 산술 검증).

## 워치리스트

```
Workflow(name: "ta-watchlist-run", args: {tickers: ["NVDA", "AMD", "AVGO"], date: "2026-08-01"})
```

종목당 에이전트 약 6개가 돌므로 한 번에 2~3종목을 권장한다.
산출물: 종목별 `.claude/team-runs/{DATE}-{TICKER}/` + 랭킹 리포트
`.claude/team-runs/{DATE}-watchlist/00-watchlist-summary.md`.

## 예약 실행

매일 장 마감 후 자동 분석을 원하면 `/schedule`로 cloud agent를 만들고 프롬프트에
`Workflow(name: "ta-team-run", args: {ticker: "...", date: "<오늘>"})`를 태운다.
`date`는 실행 시점의 날짜로 채워 넘긴다 — 워크플로 스크립트는 시계를 읽을 수 없다.

## 공통 규칙

- P0는 저장소의 `@tool` 3개(`get_verified_market_snapshot`, `get_stock_data`,
  `get_indicators`)를 호출한다. 이 값이 정확한 수치의 source of truth이고, 웹 값이
  다르면 "web source mismatch"로만 기록된다.
- 저장소 툴 호출이 실패하면 web-only degraded run으로 진행되고 모든 산출물에 명시된다.
  degraded 결과는 워치리스트 랭킹에서 자동으로 후순위다.
- 산출물은 투자 자문이 아니다. Run boundary 문구가 각 최종 리포트에 들어간다.
