# TradingAgents 트레이딩 팀

이 `.claude`는 **트레이딩 분석 실행 전용**이다. 종목을 주면 팀이 검증된 계산 위에서
분석하고 `BUY/SELL/HOLD` 시그널과 트레이딩 플랜(entry/target/stop, 손익비, 사이징,
신뢰도)을 만들어 디스크에 저장한다. 개발·유지보수 문서가 아니다.

## 실행 방법

```
# 대화형 — 변수 확인과 완료 알림이 대화에 남는다
Skill(ta-team-analysis)

# 원샷 — 단일 종목
Workflow(name: "ta-team-run", args: {ticker: "NVDA", date: "YYYY-MM-DD"})

# 워치리스트 — 복수 종목 비교·랭킹 (2~3종목 권장)
Workflow(name: "ta-watchlist-run", args: {tickers: ["NVDA", "AMD"], date: "YYYY-MM-DD"})

# 예약 — /schedule 로 cloud agent를 만들어 매일 장 마감 후 ta-team-run을 태운다
```

## 팀 구성과 데이터 흐름

```
P0 저장소 @tool 호출 (에이전트 아님 — 계산은 전부 tradingagents가 한다)
 └→ 00-market-data.md    get_verified_market_snapshot + get_stock_data + get_indicators
     ├→ ta-market-analyst            → 01-technical-analysis.md   (Bullish/Bearish/Neutral)
     ├→ ta-fundamentals-analyst      → 02-fundamentals-analysis.md (Strong/Moderate/Weak)
     ├→ ta-news-sentiment-analyst    → 03-news-sentiment-analysis.md (Positive/Negative/Mixed)
     └→ ta-risk-trader (00~03 읽음)  → 04-risk-trade-decision.md  (FINAL SIGNAL + 트레이딩 플랜)
         └→ 오케스트레이터            → 05-final-report.md
```

**모든 산출물은 `.claude/team-runs/{DATE}-{TICKER}/`에 저장된다.** 다른 위치는 없다.
에이전트 4개 모두 `model: inherit`.

## 트레이딩 원칙 (이 팀의 계약)

- **계산은 저장소 툴이, 해석은 Claude가.** 가격·이동평균·RSI·MACD·Bollinger·ATR·
  거래량은 `tradingagents`의 `@tool`을 호출해 얻는다 — 제품의 market_analyst가 쓰는
  바로 그 툴이라 벤더 라우팅과 지표 계산이 저장소 설정을 그대로 따른다. Claude가
  계산을 대신하거나 자체 스크립트로 우회하지 않는다.
- **PRICE 앵커는 00의 verified close에서만** 나온다. 웹 검색으로 기준가를 만들지
  않는다 — 오염된 앵커는 모든 레벨과 손익비를 오염시킨다.
- **웹은 해석용이다.** 웹 값이 00과 다르면 채택하거나 평균 내지 말고 "web source
  mismatch"로만 기록한다.
- **entry/target/stop은 산술 검증된다.** 손익비는 세 값과 일관해야 하고, verified
  close 기준으로 검산된다.
- **HOLD는 정당한 답이다.** 신뢰도는 내러티브가 아니라 증거의 질을 따른다.
  Data Gaps는 숨기지 않고 리포트에 남긴다.
- **stale 데이터는 시그널을 오염시키기 전에 잡는다.** 00의 STALE OHLCV WARNING은
  모든 산출물에 전파된다. 저장소 툴 호출이 실패하면 web-only degraded run으로
  명시하고 신뢰도를 낮춘다.

## 제품 파이프라인과의 경계

이 팀런은 `tradingagents/`의 Python LangGraph **전체 파이프라인이 아니다**. 다만
가격·지표는 그 제품의 market_analyst가 쓰는 **동일한 `@tool`**
(`get_verified_market_snapshot`, `get_stock_data`, `get_indicators`)로 확정하고,
Claude 팀은 그 결과를 해석·종합한다.

| | Python 파이프라인 (제품) | 이 트레이딩 팀 |
|---|---|---|
| 실행 | `tradingagents analyze` CLI | `ta-team-analysis` 스킬 / `ta-team-run` 워크플로 |
| 엔진 | 12-에이전트 LangGraph | 저장소 `@tool` + Claude 서브에이전트 + 웹 리서치 |
| 시그널 | 5단계 `Buy/Overweight/Hold/Underweight/Sell` | `BUY/SELL/HOLD` + 트레이딩 플랜 |
| 필요 조건 | LLM 프로바이더 API 키 | 불필요 (저장소 데이터 툴만) |
| 산출물 | `~/.tradingagents/logs/…json`, 메모리 로그 | `.claude/team-runs/{DATE}-{TICKER}/00…05*.md` |

두 시그널 어휘를 섞거나 서로의 파서에 넣지 마라. 유료 파이프라인은 사용자 승인 없이
실행하지 않는다.

## 환경

- P0 러너(`.claude/skills/ta-team-analysis/scripts/repo_market_data.py`)는
  `./.venv/bin/python`을 우선 사용하고, 없으면 `python3` (이 머신에 `python` shim은
  없다). import 실패 시 `pip install -e .` 후 재시도, 그래도 실패하면 degraded run으로
  명시하고 진행한다.
- **러너에 자체 계산 로직을 넣지 마라.** 러너는 저장소 `@tool`을 호출하고 출력을
  그대로 붙이는 일만 한다. 지표나 데이터 처리에 변경이 필요하면 `tradingagents/`를
  고칠 일이지 러너를 고칠 일이 아니다.
- 리서치 에이전트 4종은 LLM 쿼터가 아니라 웹 검색을 소비한다.
- 팀런 중에는 `.claude/`를 수정하지 않는다. 문서와 동작이 어긋나면 사용자에게 보고한다.

> 모든 산출물은 AI 리서치이며 투자 자문이 아니다. 백테스트·실현 수익 검증을 거치지
> 않았고, 투자 결정의 책임은 사용자에게 있다.
