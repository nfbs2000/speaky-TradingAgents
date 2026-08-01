---
name: ta-eval-backtest
description: 사용자가 "run backtest", "evaluate strategy", "test trading performance", "analyze results", "compare models", "run evaluation", "test on AAPL", "backtest January", "check agent accuracy", "A/B test models", "analyze trading results", "run crypto analysis"를 요청하거나 TradingAgents 백테스트·평가를 실행하고 분석하려 할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents 평가 및 백테스트

평가를 실행하고, 결과를 분석하고, 설정을 비교한다.

## 핵심 API

### 단일 평가

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph

graph = TradingAgentsGraph(
    selected_analysts=("market", "social", "news", "fundamentals"),
    debug=False,
    config=None,       # None → DEFAULT_CONFIG
    callbacks=None,    # LangChain 콜백, LLM 생성자로 전달됨
)

final_state, signal = graph.propagate("AAPL", "2026-01-15")
# signal ∈ {"Buy", "Overweight", "Hold", "Underweight", "Sell"}
```

**upstream API와 다른, 반드시 알아둬야 할 세 가지:**

1. **시그널은 5단계이며 Title-case다** — `BUY`/`SELL`/`HOLD`가 아니라
   `Buy` / `Overweight` / `Hold` / `Underweight` / `Sell`. `"BUY"`로 분기하는
   코드는 조용히 영원히 매칭되지 않는다.
2. **`process_signal()`은 LLM을 호출하지 않는다.** Portfolio Manager의 구조화
   출력이 항상 `**Rating**: X` 헤더를 렌더링하므로, `SignalProcessor`는
   `rating.parse_rating()`(정규식 + 단어 스캔, 기본값 `"Hold"`)만 실행한다.
3. **`propagate()`는 세 번째 인자를 받는다**: `asset_type="stock" | "crypto"`.

```python
final_state, signal = graph.propagate("BTC-USD", "2026-01-15", asset_type="crypto")
```

### 리플렉션 — 메서드 호출이 아니라 자동

**`graph.reflect_and_remember(returns)`는 없다.** 리플렉션은 지연 실행된다.

- `propagate()`는 마지막에 메모리 로그에 `| pending]` 엔트리를 추가한다.
- 같은 티커에 대한 **다음** `propagate()`가 그것을 해소한다. 실제 수익률 5거래일치와
  벤치마크를 가져와 알파를 계산하고, LLM에 2~4문장 리플렉션을 요청한다.

따라서 한 티커에 대해 연속된 날짜를 도는 백테스트 루프는 별도 호출 없이 진행하면서
스스로 학습한다. `main.py`에는 여전히 주석 처리된
`ta.reflect_and_remember(1000)`이 남아 있는데, 이는 낡은 코드다.

새 분석 없이 해소를 강제하려면:
```python
graph._resolve_pending_entries("AAPL")
```

### 리포트 저장

```python
path = graph.save_reports(final_state, "AAPL")                    # results_dir/reports/ 아래
path = graph.save_reports(final_state, "AAPL", save_path="./out") # 명시적 지정
```

`reporting.write_report_tree()`를 통해 CLI와 동일한 디스크 트리를 생성한다:

```
{save_path}/
├── 1_analysts/{market,sentiment,news,fundamentals}.md
├── 2_research/{bull,bear,manager}.md
├── 3_trading/trader.md
├── 4_risk/{aggressive,conservative,neutral}.md
├── 5_portfolio/decision.md
└── complete_report.md
```

기본 `save_path`는
`{results_dir}/reports/{safe_ticker}_{YYYYmmdd_HHMMSS}`다. 각 섹션은 대응하는 상태
필드가 비어 있지 않을 때만 기록되므로, 부분 실행은 부분 트리를 만든다.

## 결과 로그 구조

모든 `propagate()`는 JSON 상태 로그도 기록한다 — 경로는 `eval_results/`가 **아니라**
`results_dir` 아래임에 주의한다:

```
{results_dir}/{TICKER}/TradingAgentsStrategy_logs/full_states_log_{DATE}.json
```

`results_dir`의 기본값은 `~/.tradingagents/logs`이며
(`TRADINGAGENTS_RESULTS_DIR`로 재정의). 티커는 `safe_ticker_component()`를 거치므로
디렉터리를 벗어날 수 없다.

JSON에는 다음이 담긴다:
`company_of_interest`, `trade_date`, `market_report`, `sentiment_report`,
`news_report`, `fundamentals_report`,
`investment_debate_state`(bull_history, bear_history, history, current_response,
judge_decision — **`count`는 없음**),
`trader_investment_decision`(주의: JSON 키가 상태 키 `trader_investment_plan`과 다름),
`risk_debate_state`(aggressive/conservative/neutral history, history,
judge_decision), `investment_plan`, `final_trade_decision`.

## 백테스트 워크플로

### 1. 거래일 선택

```python
import pandas as pd
dates = [d.strftime("%Y-%m-%d")
         for d in pd.bdate_range(start="2026-01-02", end="2026-03-01")]
```

영업일만 뽑는다. 거래소 휴장일은 여전히 섞여 들어온다. 휴장일 실행도 대개 동작하는데,
OHLCV 로더가 해당 날짜 이전(포함)의 최신 행을 가져오기 때문이다. 다만 실현 수익률
윈도가 어긋난다.

### 2. 그래프 하나를 재사용하며 순차 실행

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph

graph = TradingAgentsGraph(debug=False)      # 재사용: LLM 클라이언트 한 쌍, 캐시 예열
results = {}
for date in dates:
    try:
        state, signal = graph.propagate("AAPL", date)
        results[date] = signal
        print(f"{date}: {signal}")
    except Exception as e:
        print(f"{date}: ERROR - {e}")
        results[date] = "ERROR"
```

인스턴스를 재사용하면 메모리 로그가 진행하면서 이전 날짜들을 차례로 해소한다는
뜻이기도 하다. 루프가 끝날 무렵이면 앞선 엔트리들에 실제 리플렉션이 담긴다.

긴 스윕에서는 `checkpoint_enabled`를 설정해, 특정 날짜 중간에 크래시가 나도 그래프
전체를 다시 돌리지 않고 이어서 실행되게 한다:

```python
config = {**DEFAULT_CONFIG, "checkpoint_enabled": True}
```

### 3. 실현 수익률로 시그널 채점

프레임워크에 이미 있는 기능이다 — 다시 구현하지 마라:

```python
raw, alpha, days = graph._fetch_returns("AAPL", date, holding_days=5,
                                        benchmark=graph._resolve_benchmark("AAPL"))
```

가격을 구할 수 없으면(너무 최근, 상장폐지, 네트워크 오류) `(None, None, None)`을
반환한다. `_resolve_benchmark`는 티커 접미사로 지역 지수를 고르며
(`.T`→`^N225`, `.L`→`^FTSE`, …), 기본값은 `SPY`다.

### 4. 누적된 리플렉션 읽기

```python
print(graph.memory_log.get_past_context("AAPL", n_same=20, n_cross=0))
```

또는 마크다운 로그를 직접 읽는다 — 이것이 감사 추적 기록이다:
```bash
cat ~/.tradingagents/memory/trading_memory.md
```

## 설정 A/B 테스트

```python
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

config_a = {**DEFAULT_CONFIG, "llm_provider": "openai",
            "deep_think_llm": "gpt-5.5", "quick_think_llm": "gpt-5.4-mini"}
config_b = {**DEFAULT_CONFIG, "llm_provider": "anthropic",
            "deep_think_llm": "claude-fable-5", "quick_think_llm": "claude-haiku-4-5"}

graph_a = TradingAgentsGraph(config=config_a)
graph_b = TradingAgentsGraph(config=config_b)
```

**메모리 로그를 각 arm별로 분리하라. 그러지 않으면 arm B가 arm A의 결정을 학습한다:**

```python
config_a["memory_log_path"] = "./ab/arm_a_memory.md"
config_b["memory_log_path"] = "./ab/arm_b_memory.md"
```

JSON 로그를 분리하고 싶다면 `results_dir`도 마찬가지로 처리한다.

**실행 간 분산 줄이기**: `"temperature": 0`을 설정한다. 모든 프로바이더로 전달되지만
추론 모델은 대체로 무시하며, **어떤 설정으로도 LLM 출력이 실행마다 비트 단위로
동일해지지는 않는다.** 단일 실행의 A/B 차이는 노이즈로 취급하고, 여러 날짜에 걸친
분포를 비교하라.

**`set_config` 관련 주의점 하나**: `TradingAgentsGraph.__init__`은
`dataflows.config.set_config(self.config)`를 호출하며, 이는 **모듈 전역** 상태를
변경한다. 한 프로세스 안의 두 그래프가 그 전역을 공유하므로, 나중에 생성된 쪽의 벤더
설정이 양쪽 모두에 적용된다. 한 번에 하나의 arm만 구성해 실행하거나, arm을 별도
프로세스로 실행하라.

## 평가용 핵심 설정

```python
"results_dir":              "~/.tradingagents/logs",     # TRADINGAGENTS_RESULTS_DIR
"data_cache_dir":           "~/.tradingagents/cache",    # TRADINGAGENTS_CACHE_DIR
"memory_log_path":          "~/.tradingagents/memory/trading_memory.md",
"memory_log_max_entries":   None,       # 해소된 엔트리 수 상한
"max_debate_rounds":        1,          # 비용/품질 조절: 턴 수 = 2 × 이 값
"max_risk_discuss_rounds":  1,          # 턴 수 = 3 × 이 값
"checkpoint_enabled":       False,
"benchmark_ticker":         None,       # 모든 티커의 알파 기준선을 재정의
"temperature":              None,
"llm_max_retries":          None,       # 순간적인 429를 견디려면 값을 올린다
"output_language":          "English",
```

`selected_analysts`는 설정 키가 아니라 **생성자 인자**다.

## 비용 관리

실행 1회당 대략적인 LLM 호출 예산: 애널리스트 4명(× N 툴 라운드) +
`2 × max_debate_rounds` 리서처 턴 + 리서치 매니저 1 + 트레이더 1 +
`3 × max_risk_discuss_rounds` 디베이터 턴 + 포트폴리오 매니저 1
+ 해소 가능한 pending 엔트리당 리플렉션 1. `process_signal`은 비용이 없다.

의미 있는 최소 비용 설정: `selected_analysts=("market",)`에 두 라운드 수를 모두 1로.

콜백을 통한 토큰 추적(LLM 생성자로 전달됨):
```python
from langchain_community.callbacks import get_openai_callback
with get_openai_callback() as cb:
    state, signal = graph.propagate("AAPL", "2026-01-15")
    print(cb.total_tokens, cb.total_cost)
```
`langchain_community`는 선언된 의존성이 아니므로 별도로 설치해야 한다.
CLI는 대신 자체 `cli/stats_handler.py`를 사용한다.

## 저장된 로그 분석

```python
import json
from pathlib import Path
from tradingagents.default_config import DEFAULT_CONFIG

logs = Path(DEFAULT_CONFIG["results_dir"]) / "AAPL" / "TradingAgentsStrategy_logs"
for f in sorted(logs.glob("full_states_log_*.json")):
    state = json.load(f.open())
    print(state["trade_date"], state["final_trade_decision"][:80].replace("\n", " "))
```

## 헬퍼 스크립트

`scripts/run_single_eval.py` — 프로바이더, 모델, 애널리스트, 자산 유형, 리포트 저장
플래그를 지정해 티커/날짜 1건을 실행한다:

```bash
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py AAPL 2026-01-15
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py BTC-USD 2026-01-15 --asset-type crypto
python3 .claude/skills/ta-eval-backtest/scripts/run_single_eval.py MSFT 2026-02-02 \
    --analysts market,fundamentals --save-reports ./out --json
```

## 검증

```bash
python3 -c "
import inspect
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.agents.utils.rating import RATINGS_5_TIER
print('propagate', inspect.signature(TradingAgentsGraph.propagate))
print('ratings', RATINGS_5_TIER)
print('has reflect_and_remember:', hasattr(TradingAgentsGraph, 'reflect_and_remember'))
"
pytest tests/test_signal_processing.py tests/test_reporting.py \
       tests/test_memory_log.py tests/test_crypto_asset_mode.py \
       tests/test_date_boundaries.py -q
```

`has reflect_and_remember: False`가 나와야 한다.

## 추가 자료

- **`scripts/run_single_eval.py`** — 티커/날짜 단일 실행 러너
- **`references/evaluation_guide.md`** — 전체 API 표면, 상태 필드 레퍼런스,
  지표, 평가 패턴
