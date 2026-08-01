# 평가 가이드

## `TradingAgentsGraph` API 레퍼런스

### 생성자

```python
TradingAgentsGraph(
    selected_analysts=('market', 'social', 'news', 'fundamentals'),
    debug=False,
    config: dict[str, Any] = None,
    callbacks: list | None = None,
)
```

- `selected_analysts` — 기본값은 튜플이며, 순서가 곧 실행 순서다. 유효한 키:
  `market`, `social`, `news`, `fundamentals`. 알 수 없는 키 → `ValueError`,
  비어 있으면 → `ValueError`. 이것은 `propagate()` 인자도 설정 키도 아닌
  **생성자** 인자다.
- `debug` — `True`면 pretty-printing과 함께 `graph.stream()`을, `False`면
  `graph.invoke()`를 사용한다. 둘 다 동등하게 병합된 최종 상태를 반환한다.
- `config` — 전체 설정 dict. `None`이면 `DEFAULT_CONFIG`를 사용한다.
- `callbacks` — **LLM 생성자**로 전달되므로(`llm_kwargs["callbacks"]`) LLM 호출을
  포착한다. 툴 실행 콜백은 별도 경로다:
  `Propagator.get_graph_args(callbacks=...)`.

생성자의 부수 효과: `set_config(config)`(모듈 전역 dataflows 설정을 변경),
`data_cache_dir`와 `results_dir`에 대한 `mkdir`, LLM 클라이언트 2개 생성
(**API 키 필요**), `TradingMemoryLog`·툴 노드·`ConditionalLogic`·
`GraphSetup`·`Propagator`·`Reflector`·`SignalProcessor` 생성, 이어서
`setup_graph()` + `compile()`.

### `propagate()`

```python
final_state, signal = graph.propagate(company_name: str, trade_date: str,
                                      asset_type: str = "stock")
```

실행 순서:

1. `self.ticker = company_name`
2. **`_resolve_pending_entries(company_name)`** — 이전 실행들에 대한 Phase B 리플렉션
3. `checkpoint_enabled`면: SqliteSaver 컨텍스트 진입, saver와 함께 재컴파일,
   resume/fresh 로깅
4. `_run_graph(...)`:
   - `past_context = memory_log.get_past_context(ticker)`
   - `instrument_context = resolve_instrument_context(ticker, asset_type)`
   - `create_initial_state(...)` + `get_graph_args()`
   - `graph.invoke()`(debug일 때는 stream)
   - `_log_state(trade_date, final_state)` → JSON
   - `memory_log.store_decision(...)` → pending 엔트리
   - 성공 시 `clear_checkpoint(...)`
   - `(final_state, process_signal(final_state["final_trade_decision"]))` 반환
5. `finally`: 체크포인터 컨텍스트를 빠져나오고 체크포인터 없이 재컴파일

### `process_signal()`

```python
signal = graph.process_signal(full_signal: str)   # → "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell"
```

`SignalProcessor.process_signal`은 `rating.parse_rating(text, default="Hold")`의 얇은
래퍼다. **LLM 호출 없음.** 두 단계로 동작한다. 먼저 명시적인 `Rating: X` 레이블
(마크다운 볼드와 `:` 또는 `-`를 허용), 그다음 텍스트 어디서든 처음 등장하는 5단계
등급 단어. `SignalProcessor.__init__`은 하위 호환을 위해 여전히 LLM 인자를 받지만
무시한다.

### `save_reports()`

```python
path = graph.save_reports(final_state, ticker, save_path=None) -> Path
```
`complete_report.md`의 경로를 반환한다. 기본 위치:
`{results_dir}/reports/{safe_ticker_component(ticker)}_{YYYYmmdd_HHMMSS}`.

### `resolve_instrument_context()`

```python
ctx = graph.resolve_instrument_context(ticker, asset_type="stock") -> str
```
결정론적이며 캐시된다(`resolve_instrument_identity`에 대한
`functools.lru_cache(maxsize=256)`). 회사명 / 섹터 등을 yfinance에서 fail-open 방식으로
조회해, 모든 에이전트 프롬프트에 주입되는 문자열로 포맷한다(upstream #814).
`propagate()`와 CLI 양쪽에서 호출되므로, 진입 지점과 무관하게 종목 정체성 정보가
그래프에 전달된다.

### 평가에 유용한 내부 헬퍼

```python
graph._resolve_benchmark(ticker) -> str
graph._fetch_returns(ticker, trade_date, holding_days=5, benchmark="SPY")
    -> tuple[float | None, float | None, int | None]   # (raw, alpha, actual_days)
graph._resolve_pending_entries(ticker) -> None
graph._run_signature(asset_type) -> str
graph.memory_log.get_past_context(ticker, n_same=5, n_cross=3) -> str
graph.memory_log.load_entries() -> list[dict]
```

언더스코어로 시작하므로 안정성이 보장되지는 않는다. 하지만 프레임워크 자체의
수익률/알파 계산이며, 이를 다시 구현하면 리플렉션이 말하는 내용과 어긋날 위험이 있다.

### 상태 추적 속성

```python
graph.curr_state        # 마지막 final_state
graph.ticker            # 마지막 티커
graph.log_states_dict   # {date_str: 로깅된 상태 dict}
graph.selected_analysts # 튜플, 체크포인트 시그니처의 일부
graph.workflow          # 컴파일되지 않은 StateGraph (체크포인트 재컴파일용으로 보관)
graph.graph             # 컴파일된 그래프
```

## `propagate()` 이후 사용 가능한 상태 필드

```python
final_state = {
    # 입력 / 실행 컨텍스트
    "company_of_interest": str,
    "asset_type": str,            # "stock" | "crypto"
    "instrument_context": str,    # 결정론적 종목 정체성 문자열
    "trade_date": str,
    "past_context": str,          # 실행 시작 시 주입된 메모리 로그 교훈
    "messages": list,             # LangGraph MessagesState

    # 애널리스트 리포트
    "market_report": str,
    "sentiment_report": str,      # 렌더링된 SentimentReport (밴드 + 점수 + 서술)
    "news_report": str,
    "fundamentals_report": str,

    # 투자 토론
    "investment_debate_state": {
        "bull_history": str, "bear_history": str, "history": str,
        "current_response": str, "judge_decision": str, "count": int,
    },
    "investment_plan": str,          # 렌더링된 ResearchPlan

    # 트레이더
    "trader_investment_plan": str,   # 렌더링된 TraderProposal
    "sender": str,                   # "Trader"

    # 리스크 토론
    "risk_debate_state": {
        "aggressive_history": str, "conservative_history": str,
        "neutral_history": str, "history": str,
        "latest_speaker": str,       # PM 실행 후에는 "Judge"
        "current_aggressive_response": str,
        "current_conservative_response": str,
        "current_neutral_response": str,
        "judge_decision": str, "count": int,
    },
    "final_trade_decision": str,     # 렌더링된 PortfolioDecision
}
```

## 로그 파일 포맷

경로: `{results_dir}/{safe_ticker}/TradingAgentsStrategy_logs/full_states_log_{DATE}.json`
(`results_dir` 기본값 `~/.tradingagents/logs`).

`_log_state`가 기록한다. 인메모리 상태와의 차이:

- 키 `trader_investment_decision` ← 상태 키 `trader_investment_plan`
- `investment_debate_state`에서 `count` 누락
- `risk_debate_state`에서 `latest_speaker`, `count`, 세 개의
  `current_*_response` 필드 누락
- `messages`, `asset_type`, `instrument_context`, `past_context`는 기록되지 않음

`encoding="utf-8"`로 `json.dump(..., indent=4)` 하므로 비영어 리포트도 그대로 왕복한다.

## 렌더링된 출력 형태

결정론적 헤더를 알아두면 저장된 리포트를 파싱하기 쉽다:

```
final_trade_decision  →  **Rating**: X
                         **Executive Summary**: ...
                         **Investment Thesis**: ...
                         [**Price Target**: N]
                         [**Time Horizon**: ...]

investment_plan       →  **Recommendation**: X
                         **Rationale**: ...
                         **Strategic Actions**: ...

trader_investment_plan → **Action**: Buy|Hold|Sell
                         **Reasoning**: ...
                         [**Entry Price**: N]  [**Stop Loss**: N]  [**Position Sizing**: ...]
                         FINAL TRANSACTION PROPOSAL: **BUY|HOLD|SELL**

sentiment_report      →  **Overall Sentiment:** **Band** (Score: N.N/10)
                         **Confidence:** Low|Medium|High
                         <narrative>
```

이 형태는 `agents/schemas.py`의 `render_*` 헬퍼에서 나온다. 구조화 호출이 실패해
에이전트가 자유 텍스트로 폴백하면 헤더는 **보장되지 않는다**. 따라서 파서는 헤더
부재를 견뎌야 하며, 로그의 `WARNING`("structured-output invocation failed ...
retrying once as free text")이 그 신호다.

## 평가 지표

### 시그널 정확도
5단계 등급을 방향으로 매핑하고(Buy/Overweight → 롱, Sell/Underweight → 숏 또는 플랫,
Hold → 플랫) `_fetch_returns`의 실현 `raw`와 비교한다. 등급별 적중률을 따로 추적하라 —
프레임워크 자체 프롬프트가 Hold를 억제하므로 그 기저율 자체가 정보가 된다.

### 원수익률이 아니라 알파
`_fetch_returns`는 이미 해당 티커의 지역 벤치마크 대비 알파를 반환한다. 상승장에서
원수익률로 채점하면 모든 롱 콜이 실제보다 좋아 보인다.

### 보유 윈도의 정직성
`actual_days`는 현재 시점에 가깝거나 휴장일 근처에서 `< holding_days`가 될 수 있다.
결과를 `actual_days` 기준으로 버킷팅하거나 짧은 윈도를 제외하라.

### 에이전트 단위 분석
`investment_debate_state["judge_decision"]`와 `final_trade_decision`을 대조해
Portfolio Manager가 Research Manager를 얼마나 자주 뒤집는지 확인한다.
독립적인 센티먼트 시그널로는 `sentiment_report`의 `overall_score`를 실현 수익률과
비교하라 — 수치형이고 결정론적이라 상관을 보기에 가장 저렴한 필드다.

### 메모리 효과
**서로 다른 `memory_log_path` 값**을 가진 두 arm을 두고, 하나는 이력을 심어 두고 다른
하나는 비워 둔 채 동일한 날짜 구간을 돌린다. 경로를 분리하지 않으면 두 arm이 서로를
오염시킨다.

## 흔한 평가 패턴

### 날짜 구간
```python
import pandas as pd
dates = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2026-01-02", "2026-03-01")]
```

### 다중 티커, 그래프 하나
```python
graph = TradingAgentsGraph()
for ticker in ["AAPL", "MSFT", "GOOGL", "AMZN"]:
    state, signal = graph.propagate(ticker, "2026-01-15")
    print(f"{ticker}: {signal}")
```
인스턴스를 재사용하라 — LLM 클라이언트 한 쌍과 예열된 OHLCV 캐시를 쓴다. 각 티커의
pending 엔트리는 그 티커를 다시 실행할 때만 해소된다는 점에 유의한다.

### 크립토
```python
state, signal = graph.propagate("BTC-USD", "2026-01-15", asset_type="crypto")
```
`asset_type`은 프롬프트 라벨을 바꾸며(`"stock"` 대신 `"asset"`, 그리고 데이터가 없을 수
있음을 알리는 펀더멘털 라벨) 체크포인트 시그니처의 일부다.
`dataflows.symbol_utils.normalize_symbol`은 `BTCUSDT` 같은 페어 형식을
`BTC-USD`로 매핑한다.

### 저비용 스윕
```python
graph = TradingAgentsGraph(
    selected_analysts=("market",),
    config={**DEFAULT_CONFIG, "max_debate_rounds": 1, "max_risk_discuss_rounds": 1,
            "quick_think_llm": "gpt-5.4-nano"},
)
```

### 재개 가능한 장시간 실행
```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```
`data_cache_dir` 아래에 티커별 SQLite DB가 생긴다. 스레드 ID가
티커 + 날짜 + 그래프 형태를 키로 삼으므로, 설정을 바꾸면 호환되지 않는 실행을 재개하는
대신 새로 시작한다. `tradingagents analyze --clear-checkpoints`로 전부 지운다.

### 비영어 리포트
```python
config = {**DEFAULT_CONFIG, "output_language": "Korean"}
```
추론 품질을 위해 내부 에이전트 토론은 영어로 유지되며, 리포트로 나가는 출력만
`get_language_instruction()`을 통해 현지화된다.

## 스윕에서 예상되는 실패 유형

| 증상 | 원인 | 대응 |
|---|---|---|
| 리포트 안의 `NO_DATA_AVAILABLE: ...` | 설정된 모든 벤더에 데이터가 없음(무효/상장폐지/오래됨) | 프롬프트가 모델에 날조하지 말라고 지시함. 해당 실행은 사용 불가로 집계 |
| `DATA_UNAVAILABLE: optional macro_data ...` | FRED/Polymarket 실패 | 무해함. 선택적 카테고리는 설계상 degrade됨 |
| `WARNING ... structured-output invocation failed` | 모델이 약하거나 JSON이 잘못됨 | 에이전트가 자유 텍스트로 폴백함. 렌더링 헤더가 보장되지 않음 |
| `RuntimeWarning: Model 'x' is not in the known model list` | 모델이 `MODEL_OPTIONS`에 없음 | 정보성 경고일 뿐, 실행은 계속됨 |
| 엔트리가 영원히 `pending` 상태 | 티커를 다시 실행하지 않았거나 가격을 구할 수 없음 | `_resolve_pending_entries(ticker)` 호출 |
| `ValueError: unknown analyst key` | 잘못된 `selected_analysts` | `market`/`social`/`news`/`fundamentals` 사용 |
| 두 번째 arm의 벤더 설정이 잘못됨 | `set_config`가 모듈 전역을 변경함 | 프로세스당 arm 하나 |
