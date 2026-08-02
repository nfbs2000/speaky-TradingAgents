# 12장: Claude Code 트레이딩 팀과 스킬

이 장은 현재 `.claude/` 디렉터리에 남아 있는 **트레이딩 분석 실행 팀**을 설명한다.
이전 상태에 있던 개발·유지보수 스킬과 에이전트는 정리됐고, 지금 공개되는 계약은
종목 분석 팀런에만 집중한다.

중요한 경계부터 잡는다. 이 팀은 `tradingagents/`의 Python LangGraph 전체 파이프라인을
실행하지 않는다. 대신 제품의 market analyst가 쓰는 저장소 `@tool` 세 개로 가격·지표·거래량을
먼저 확정하고, Claude Code 서브에이전트가 그 계산 결과를 해석해 마크다운 리포트를 만든다.

## 현재 구조

| 위치 | 현재 역할 |
|---|---|
| `.claude/TEAM.md` | 트레이딩 팀의 실행 계약, 데이터 흐름, 제품 파이프라인과의 경계 |
| `.claude/agents/*.md` | 네 명의 리서치 에이전트 정의 |
| `.claude/skills/ta-team-analysis/SKILL.md` | 대화형 팀런 절차와 검증 체크리스트 |
| `.claude/skills/ta-team-analysis/scripts/repo_market_data.py` | 저장소 `@tool` 호출 러너 |
| `.claude/workflows/*.js` | 단일 종목/워치리스트 원샷 실행 절차 |
| `.claude/team-runs/{DATE}-{TICKER}/` | 실제 팀런 산출물 저장소 |

삭제된 유지보수 스킬을 보유 스킬처럼 설명하면 안 된다. 현재의 `.claude`는 repo 수정팀이
아니라 **트레이딩 분석팀**이다.

## 데이터 흐름

```text
P0 저장소 @tool 호출
 └→ 00-market-data.md
     ├→ ta-market-analyst            → 01-technical-analysis.md
     ├→ ta-fundamentals-analyst      → 02-fundamentals-analysis.md
     ├→ ta-news-sentiment-analyst    → 03-news-sentiment-analysis.md
     └→ ta-risk-trader               → 04-risk-trade-decision.md
         └→ 오케스트레이터            → 05-final-report.md
```

P0는 에이전트가 아니다. `.claude/skills/ta-team-analysis/scripts/repo_market_data.py`가
저장소의 공식 `@tool`을 호출해 `00-market-data.md`를 만든다.

| Tool | 쓰임 |
|---|---|
| `get_verified_market_snapshot` | 기준일 이전의 최신 verified OHLCV와 핵심 지표를 고정 |
| `get_stock_data` | 최근 OHLCV 행을 날짜별로 제공 |
| `get_indicators` | 저장소 상수 `DEFAULT_SNAPSHOT_INDICATORS` 기준 지표 히스토리 제공 |

러너에 자체 RSI, MACD, 이동평균 계산을 넣지 않는다. 계산 로직은 저장소가 갖고, 러너는
그 출력을 파일로 고정한다. Claude 팀은 그 파일을 source of truth로 읽는다.

## 팀 구성

| Agent | 역할 | 산출물 |
|---|---|---|
| `ta-market-analyst` | 기술적 분석. 가격 추세, 지지·저항, 거래량, 지표 해석 | `01-technical-analysis.md` |
| `ta-fundamentals-analyst` | 펀더멘털 분석. 실적, 현금흐름, 밸류에이션, 경쟁 구도 | `02-fundamentals-analysis.md` |
| `ta-news-sentiment-analyst` | 뉴스와 센티먼트. 최근 사건, 셀사이드, 소셜, 내부자·기관 활동 | `03-news-sentiment-analysis.md` |
| `ta-risk-trader` | 리스크와 최종 판단. 앞의 세 리포트와 `00`을 읽고 entry/target/stop 결정 | `04-risk-trade-decision.md` |

네 에이전트는 모두 `model: inherit`이다. 별도 provider API 키를 요구하는 팀이 아니다.
웹 검색은 Claude Code가 수행하고, 수치 계산은 저장소 툴이 수행한다.

## 스킬

현재 팀런의 핵심 스킬은 `ta-team-analysis` 하나다. 이 스킬은 다음 계약을 고정한다.

| 계약 | 의미 |
|---|---|
| 저장 위치 | 모든 산출물은 `.claude/team-runs/{DATE}-{TICKER}/`에 저장한다. `output/`이 아니다. |
| 가격 앵커 | `{PRICE}`는 P0가 만든 verified close와 기준일이다. 웹 검색으로 바꾸지 않는다. |
| 병렬 구간 | 세 애널리스트는 서로의 산출물을 읽지 않으므로 병렬 실행 가능하다. |
| 순차 구간 | `ta-risk-trader`는 `00`~`03`을 모두 읽은 뒤 실행한다. |
| 검증 | `00`에 세 tool section이 있는지, `04`에 final signal과 산술이 있는지 확인한다. |
| 경계 | 최종 `BUY/SELL/HOLD`는 Python 제품 파이프라인의 5단계 rating parser와 호환되지 않는다. |

## 최신 팀런 증거

최신 대표 런은 `.claude/team-runs/2026-08-02-NVDA/`다. 분석 기준일은
2026-08-01이고, 실제 최신 거래 행은 2026-07-31이다.

| 항목 | 값 |
|---|---|
| Ticker | NVDA |
| Verified close | `$200.75` |
| RSI(14) | `48.31` |
| 50일 SMA | `206.12` |
| 200일 SMA | `192.93` |
| MACD / Signal / Hist | `-1.94 / -0.98 / -0.97` |
| ATR(14) | `7.47` |
| 최종 시그널 | `HOLD` |
| 신뢰도 | `62%` |

이번 런의 방법론적 성과는 가격 앵커가 흔들리지 않았다는 점이다. 웹 출처의 기준가,
RSI, OHLC가 verified 값과 다를 때 평균을 내거나 최신값처럼 채택하지 않고, mismatch로
기록했다. 그래서 세 애널리스트의 수치 상충이 사라지고, 남은 불확실성은 실제로 확보하지
못한 데이터 목록으로 분리됐다.

## 제품 파이프라인과의 경계

| 구분 | Python LangGraph 파이프라인 | Claude 트레이딩 팀 |
|---|---|---|
| 실행 엔진 | `tradingagents analyze`, `TradingAgentsGraph` | Claude Code 스킬/서브에이전트/워크플로 |
| 계산 | 제품 코드 안의 tool loop | 저장소 `@tool` P0 preflight |
| 해석 | 제품 에이전트와 structured state | Claude 서브에이전트 마크다운 리포트 |
| 신호 어휘 | `Buy / Overweight / Hold / Underweight / Sell` | `BUY / SELL / HOLD` |
| 산출 위치 | 제품 report tree, memory log | `.claude/team-runs/{DATE}-{TICKER}/` |
| 목적 | 제품 실행과 평가 | 교육용 팀 실행 기록과 리서치 리포트 |

따라서 `05-final-report.md`의 `HOLD`를 제품 파이프라인의 parser 입력처럼 쓰면 안 된다.
반대로 제품 파이프라인을 실행하지 않았는데 실행한 것처럼 말해도 안 된다.

## 사용 예

대화형으로 실행할 때는 스킬을 먼저 읽는다.

```text
Skill(ta-team-analysis)
```

원샷으로 단일 종목을 실행할 때는 워크플로를 호출한다.

```text
Workflow(name: "ta-team-run", args: {ticker: "NVDA", date: "2026-08-01"})
```

복수 종목을 비교할 때는 워치리스트 워크플로를 쓴다.

```text
Workflow(name: "ta-watchlist-run",
         args: {tickers: ["NVDA", "AMD", "AVGO"], date: "2026-08-01"})
```

## 핵심 정리

현재 `.claude`는 “세상의 모든 유지보수 작업을 처리하는 팀”이 아니다. TradingAgents 포크에서
트레이딩 분석을 교육용으로 재현하기 위한 작은 실행팀이다. 계산은 저장소 툴로 검증하고,
해석은 Claude 팀으로 분업한다. 이 경계를 지켜야 결과가 제품 파이프라인처럼 과장되지 않고,
동시에 단순 웹 검색 리포트처럼 숫자가 흔들리지 않는다.

## 원본 자료

- [`.claude/TEAM.md`](https://github.com/nfbs2000/speaky-TradingAgents/blob/main/.claude/TEAM.md)
- [`.claude/agents/`](https://github.com/nfbs2000/speaky-TradingAgents/tree/main/.claude/agents)
- [`.claude/skills/ta-team-analysis/SKILL.md`](https://github.com/nfbs2000/speaky-TradingAgents/blob/main/.claude/skills/ta-team-analysis/SKILL.md)
- [`.claude/team-runs/2026-08-02-NVDA/05-final-report.md`](https://github.com/nfbs2000/speaky-TradingAgents/blob/main/.claude/team-runs/2026-08-02-NVDA/05-final-report.md)
