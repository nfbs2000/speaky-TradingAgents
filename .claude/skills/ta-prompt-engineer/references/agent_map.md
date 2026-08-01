# TradingAgents — 전체 에이전트 지도

그래프 노드 12개 + 노드가 아닌 프롬프트 소유자 1개(Reflector). 줄 번호는 참고용이며,
수정 전에 항상 파일을 Read 한다.

## 애널리스트 에이전트 (quick_thinking_llm)

### Market Analyst
- **파일**: `tradingagents/agents/analysts/market_analyst.py`
- **팩토리**: `create_market_analyst(llm)` → `market_analyst_node(state)`
- **프롬프트**: `system_message` 변수 (약 24행)
- **도구**: `get_stock_data`, `get_indicators`, `get_verified_market_snapshot`
- **입력 state**: `trade_date`, `instrument_context`, `messages`
- **출력 state**: `messages`, `market_report`
- **핵심 동작**: 고정된 카탈로그(SMA/EMA/MACD 계열/RSI/볼린저/ATR/VWMA)에서 기술적
  지표를 최대 8개까지 고른다. 작성 전에 반드시 `get_stock_data`를 먼저 호출하고, 이어서
  `get_indicators`, 그다음 `get_verified_market_snapshot`을 호출해야 한다. 정확한
  OHLCV / 가격 수준 / 지표 주장에 대해서는 스냅샷이 진실의 원천이며, 충돌은 임의로
  조정하지 말고 표시해야 한다.
- **환각 방지 조항**: "Do not claim historical validation,
  support/resistance bounces, or exact percentage moves unless directly supported
  by tool output with concrete dates and prices." 이 문장은 유지한다.

### News Analyst
- **파일**: `tradingagents/agents/analysts/news_analyst.py`
- **팩토리**: `create_news_analyst(llm)` → `news_analyst_node(state)`
- **프롬프트**: `system_message` 변수 (약 27행). `asset_label`을 사용하는 f-string이다
  (주식이면 "company", 크립토면 "asset")
- **도구**: `get_news`, `get_global_news`, `get_macro_indicators`,
  `get_prediction_markets`
- **출력 state**: `messages`, `news_report`
- **핵심 동작**: 프롬프트가 각 도구를 시그니처와 함께 명시하고 유효한 FRED 지표 키
  (`cpi`, `core_pce`, `unemployment`, `fed_funds_rate`, `10y_treasury`,
  `yield_curve`)를 나열한다. `dataflows/fred.py`에 매크로 지표를 추가하면 여기에도
  추가해야 하며, 그러지 않으면 모델은 그 지표의 존재를 알지 못한다.

### Fundamentals Analyst
- **파일**: `tradingagents/agents/analysts/fundamentals_analyst.py`
- **팩토리**: `create_fundamentals_analyst(llm)` → `fundamentals_analyst_node(state)`
- **프롬프트**: `system_message` 변수 (약 25행)
- **도구**: `get_fundamentals`, `get_balance_sheet`, `get_cashflow`,
  `get_income_statement`
- **출력 state**: `messages`, `fundamentals_report`

### Sentiment Analyst
- **파일**: `tradingagents/agents/analysts/sentiment_analyst.py`
- **팩토리**: `create_sentiment_analyst(llm)` → `sentiment_analyst_node(state)`
- **폐기 예정 별칭**: `create_social_media_analyst(llm)` — `DeprecationWarning`을 내며
  위 팩토리에 위임한다
- **프롬프트**: 모듈 수준 `_build_system_message(...)` (약 126행). 호출 지점은
  약 74행
- **도구**: **바인딩 없음**. LLM 호출 전에 세 개의 소스를 미리 가져온다.
  `get_news.func(ticker, start, end)` (`.func`는 `@tool` 래퍼를 우회한다),
  `fetch_stocktwits_messages(ticker, limit=30)`, `fetch_reddit_posts(ticker)`
- **구조화 출력**: `SentimentReport` → `render_sentiment_report`
- **출력 state**: `messages` (`AIMessage` 하나), `sentiment_report`
- **재설계 이유**: 기존 `social_media_analyst`는 소셜 미디어 분석을 요구하면서도 Yahoo
  뉴스만 갖고 있었기 때문에 모델이 Reddit/X/StockTwits 내용을 지어냈다
  (upstream #557, #796). 이제 데이터는 0턴부터 프롬프트 안에 들어 있다.
- **조회 기간**: `_seven_days_back(trade_date)`로 7일 고정

## 리서처 에이전트 (quick_thinking_llm, 메모리 인자 없음)

### Bull Researcher
- **파일**: `tradingagents/agents/researchers/bull_researcher.py`
- **팩토리**: `create_bull_researcher(llm)` → `bull_node(state)`
- **프롬프트**: `prompt` f-string (약 27행)
- **입력 state**: `investment_debate_state`, 리포트 4종 전부, `instrument_context`,
  `asset_type`
- **출력 state**: `investment_debate_state` (bull 논거 추가, `count + 1`)
- **템플릿 변수**: `{instrument_context}`, `{market_research_report}`,
  `{sentiment_report}`, `{news_report}`, `{fundamentals_report}`, `{history}`,
  `{current_response}`, 그리고 크립토용 `{target_label}` / `{fundamentals_label}`
- **화자 접두사**: `argument = f"Bull Analyst: {response.content}"` —
  `should_continue_debate`가 라우팅에 사용하는 것이 `"Bull"` 접두사다. 바꾸지 않는다.

### Bear Researcher
- **파일**: `tradingagents/agents/researchers/bear_researcher.py`
- **팩토리**: `create_bear_researcher(llm)` → `bear_node(state)`
- **프롬프트**: `prompt` f-string (약 27행)
- state 입출력과 변수는 Bull과 동일하다. 접두사는 `"Bear Analyst: "`이다

## 매니저 에이전트 (deep_thinking_llm, 구조화 출력)

### Research Manager
- **파일**: `tradingagents/agents/managers/research_manager.py`
- **팩토리**: `create_research_manager(llm)` → `research_manager_node(state)`
- **프롬프트**: `prompt` f-string (약 26행)
- **구조화 출력**: `ResearchPlan` (`recommendation` / `rationale` /
  `strategic_actions`) → `render_research_plan`
- **입력 state**: `investment_debate_state["history"]`, 리포트들
- **출력 state**: `investment_debate_state` (`judge_decision` 포함), `investment_plan`
- **등급**: 5단계 `PortfolioRating`

### Portfolio Manager (리스크 판정자 — 예전 "Risk Manager")
- **파일**: `tradingagents/agents/managers/portfolio_manager.py`
- **팩토리**: `create_portfolio_manager(llm)` → `portfolio_manager_node(state)`
- **프롬프트**: `prompt` f-string (약 43행)
- **구조화 출력**: `PortfolioDecision` (`rating` / `executive_summary` /
  `investment_thesis` / `price_target?` / `time_horizon?`) → `render_pm_decision`
- **입력 state**: `risk_debate_state`, `investment_plan`, `trader_investment_plan`,
  **`past_context`** (메모리 로그 교훈 — 이를 받는 유일한 에이전트)
- **출력 state**: `risk_debate_state` (`judge_decision` 포함), `final_trade_decision`
- **그래프 상의 노드 이름**: `"Portfolio Manager"`

## 트레이더 에이전트 (quick_thinking_llm, 구조화 출력)

### Trader
- **파일**: `tradingagents/agents/trader/trader.py`
- **팩토리**: `create_trader(llm)` → `functools.partial(trader_node, name="Trader")`
- **프롬프트**: `messages` 리스트, system + user dict (약 29행)
- **구조화 출력**: `TraderProposal` (`action` / `reasoning` / `entry_price?` /
  `stop_loss?` / `position_sizing?`) → `render_trader_proposal`
- **입력 state**: `company_of_interest`, `instrument_context`, `investment_plan`
- **출력 state**: `messages`, `trader_investment_plan`, `sender`
- **포함 사항**: 시스템 메시지에 `NO_EXTERNAL_TOOLS`
- **렌더링 말미**: `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` (애널리스트 중단
  신호 텍스트 및 외부 grep과의 하위 호환을 위해 유지)

## 리스크 debator 에이전트 (quick_thinking_llm, 메모리 없음)

세 에이전트 모두 같은 형태다: `create_{stance}_debator(llm)` → `{stance}_node(state)`,
약 24행의 프롬프트 f-string, 끝은
`"Output conversationally as if you are speaking without any special formatting."
+ get_language_instruction()`로 마무리된다.

| 성향 | 파일 | 화자 라벨 |
|--------|------|---------------|
| Aggressive | `agents/risk_mgmt/aggressive_debator.py` | `Aggressive` |
| Conservative | `agents/risk_mgmt/conservative_debator.py` | `Conservative` |
| Neutral | `agents/risk_mgmt/neutral_debator.py` | `Neutral` |

- **입력 state**: `risk_debate_state`, 리포트 4종 전부, `trader_investment_plan`
- **출력 state**: `risk_debate_state` (갱신됨, `count + 1`, `latest_speaker` 설정)
- `latest_speaker`가 `should_continue_risk_analysis`를 구동한다. 라우터는
  `.startswith("Aggressive")` / `.startswith("Conservative")`로 판별하므로 라벨 문자열이
  동작을 좌우한다.

## Reflector (그래프 노드 아님)

- **파일**: `tradingagents/graph/reflection.py`
- **클래스**: `Reflector(quick_thinking_llm)`
- **시스템 프롬프트**: `_get_log_reflection_prompt()` (약 14행)
- **유일한 공개 메서드**: `reflect_on_final_decision(final_decision, raw_return,
  alpha_return, benchmark_name="SPY") -> str`
- **호출 주체**: 같은 티커의 다음 실행 시작 시
  `TradingAgentsGraph._resolve_pending_entries()` (지연 / Phase B 회고)
- **출력 계약**: 마크다운 없이 평문 산문 정확히 2~4문장. 메모리 로그에 그대로 저장되어
  이후 프롬프트에 다시 주입되므로, 이 프롬프트의 길이 통제가 향후 컨텍스트 팽창을 직접
  좌우한다.
- 에이전트별 회고는 **없다** (`reflect_bull_researcher` 등은 이 포크에 존재하지 않는다).

## LLM 배정 요약

| LLM | 에이전트 |
|-----|--------|
| `quick_thinking_llm` | 애널리스트 4종, Bull, Bear, Trader, debator 3종, Reflector |
| `deep_thinking_llm` | Research Manager, Portfolio Manager |

## 구조화 출력 요약

| 에이전트 | 스키마 | 렌더러 |
|-------|--------|----------|
| Sentiment Analyst | `SentimentReport` | `render_sentiment_report` |
| Research Manager | `ResearchPlan` | `render_research_plan` |
| Trader | `TraderProposal` | `render_trader_proposal` |
| Portfolio Manager | `PortfolioDecision` | `render_pm_decision` |

네 에이전트 모두 `agents/utils/structured.py`를 거친다. 생성 시
`bind_structured(llm, Schema, name)`, 호출 시
`invoke_structured_or_freetext(structured_llm, plain_llm, prompt, render, name)`.
실패가 나면 (지원하지 않는 프로바이더, 잘못된 JSON, 산문으로 답하는 thinking 모델) 경고를
남기고 평범한 `llm.invoke`로 폴백하므로 파이프라인이 멈추는 일은 없다.

## 메모리 / 컨텍스트 주입

이 포크에는 에이전트별 BM25 메모리가 없다. 추가 전용 마크다운 로그 하나
(`TradingMemoryLog`)가 `state["past_context"]`를 공급하며, 이를 읽는 것은 Portfolio
Manager뿐이다. `ta-memory-manager` 스킬을 참고한다.
