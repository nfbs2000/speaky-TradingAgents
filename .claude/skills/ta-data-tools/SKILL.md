---
name: ta-data-tools
description: 사용자가 "add data source", "create data tool", "switch data vendor", "add technical indicator", "new API integration", "change from yfinance to alpha vantage", "add crypto data", "create custom tool", "modify data tool", "add macro indicator", "FRED", "polymarket", "stocktwits", "reddit sentiment source"를 요청하거나 TradingAgents의 데이터 도구와 소스를 추가·수정하려 할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents 데이터 도구

TradingAgents 시스템의 데이터 도구와 소스를 추가, 수정, 설정한다.

## 현재 도구 목록

`tradingagents/agents/utils/`에 LangChain `@tool` 함수 11개가 있다:

| 도구 | 파일 | 카테고리 | 사용 주체 | 벤더 |
|------|------|----------|---------|---------|
| `get_stock_data` | `core_stock_tools.py` | `core_stock_apis` | Market | yfinance, alpha_vantage |
| `get_indicators` | `technical_indicators_tools.py` | `technical_indicators` | Market | yfinance, alpha_vantage |
| `get_fundamentals` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_balance_sheet` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_cashflow` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_income_statement` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_news` | `news_data_tools.py` | `news_data` | News (+ Sentiment, 직접 호출) | yfinance, alpha_vantage |
| `get_global_news` | `news_data_tools.py` | `news_data` | News | yfinance, alpha_vantage |
| `get_insider_transactions` | `news_data_tools.py` | `news_data` | News (바인딩됨) | yfinance, alpha_vantage |
| `get_macro_indicators` | `macro_data_tools.py` | `macro_data` | News | **fred** 전용 |
| `get_prediction_markets` | `prediction_markets_tools.py` | `prediction_markets` | News | **polymarket** 전용 |

그리고 벤더 라우팅을 아예 우회하는 도구가 하나 있다:

| `get_verified_market_snapshot` | `market_data_validation_tools.py` | — | Market | `market_data_validator`를 직접 호출 |

또한 도구가 **아닌** 페처가 두 개 있다. Sentiment Analyst가 일반 함수로 호출해서
그 결과를 자기 프롬프트에 주입한다:

| `fetch_stocktwits_messages(ticker, limit=30)` | `dataflows/stocktwits.py` |
| `fetch_reddit_posts(ticker)` | `dataflows/reddit.py` |

## 구조

### 세 개의 레이어

```
agents/utils/*_tools.py     @tool 래퍼 — 시그니처와 독스트링만
        ↓ route_to_vendor(method, *args)
dataflows/interface.py      레지스트리: TOOLS_CATEGORIES, VENDOR_METHODS, 라우팅 + 폴백
        ↓
dataflows/{y_finance,alpha_vantage_*,fred,polymarket}.py   벤더 구현
```

`agents/utils/agent_utils.py`는 에이전트와
`trading_graph._create_tool_nodes()`가 임포트해 가는 재export 레지스트리(`__all__`)다.
도구 11개에 더해 `build_instrument_context`, `resolve_instrument_identity`,
`get_instrument_context_from_state`, `get_language_instruction`, `create_msg_delete`를 재export한다.

### 도구 래퍼는 얇다

모든 도구 본문은 `route_to_vendor` 호출 하나다. **도구마다
`if vendor == ...` 사다리를 두지 않는다** — 벤더 디스패치는 중앙화되어 있다:

```python
from tradingagents.dataflows.interface import route_to_vendor

@tool
def get_stock_data(
    symbol: Annotated[str, "ticker symbol of the company"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """Retrieve stock price data (OHLCV) for a given ticker symbol.
    Uses the configured core_stock_apis vendor.
    ...
    """
    return route_to_vendor("get_stock_data", symbol, start_date, end_date)
```

독스트링이 **곧** LLM이 보는 도구 설명이다. 모델을 위해 써라.

### 벤더 라우팅 (`dataflows/interface.py`)

모듈 수준 테이블 세 개:

```python
TOOLS_CATEGORIES = { "core_stock_apis": {"description": ..., "tools": [...]}, ... }
VENDOR_LIST      = ["yfinance", "fred", "polymarket", "alpha_vantage"]
VENDOR_METHODS   = { "get_stock_data": {"alpha_vantage": ..., "yfinance": ...}, ... }
OPTIONAL_CATEGORIES = {"macro_data", "prediction_markets"}
```

`get_vendor(category, method)` — 도구 수준의 `tool_vendors[method]`가 카테고리
수준의 `data_vendors[category]`보다 우선하며, 없으면 문자열 `"default"`로 폴백한다.

`route_to_vendor(method, *args, **kwargs)`:

1. 카테고리 → 벤더 설정 문자열을 해석하고 `,`로 나눠 체인을 만든다.
2. **설정한 목록이 곧 체인이다.** 지정하지 않은 벤더는 절대 쓰이지 않는다
   (upstream #988/#289). 사용할 수 없는 벤더를 지정하면 `ValueError`가 발생한다.
   `"default"` 센티널은 "이 메서드에 사용 가능한 모든 벤더"를 뜻한다.
3. 각 벤더를 순서대로 시도하며 예외 **타입**(`dataflows/errors.py`)에 따라 반응한다:

| 예외 | 반응 |
|-----------|----------|
| `VendorRateLimitError` | 경고 로그, 다음 벤더 시도 |
| `VendorNotConfiguredError` | 경고 로그, `first_error`로 기억, 다음 시도 |
| `NoMarketDataError` | `last_no_data`로 기억, 다음 시도 |
| 그 밖의 `Exception` | 경고 로그, `first_error`로 기억, 다음 시도 |

4. 결과 우선순위: 어느 벤더든 `NoMarketDataError`를 보고했다면
   `NO_DATA_AVAILABLE: ...` 센티널 문자열을 반환한다(요청 심볼과 정규 심볼,
   그리고 `detail`을 포함하며 모델에게 지어내지 말라고 명시적으로 지시한다).
   그렇지 않고 `first_error`가 있으며 카테고리가 `OPTIONAL_CATEGORIES`에 있으면
   `DATA_UNAVAILABLE: ...` 센티널을 반환한다. 그 외에는 `first_error`를 **던진다**.

이 구분이 중요하다. 가격이나 재무 벤더가 고장 나면 시끄럽게 알리고, 매크로나
예측시장 벤더가 고장 나면 센티널로 격하되어 부가 데이터 때문에 실행이 중단되지 않는다.

### 데이터 벤더 설정 (`default_config.py`)

```python
"data_vendors": {
    "core_stock_apis":      "yfinance",   # alpha_vantage, yfinance
    "technical_indicators": "yfinance",   # alpha_vantage, yfinance
    "fundamental_data":     "yfinance",   # alpha_vantage, yfinance
    "news_data":            "yfinance",   # alpha_vantage, yfinance
    "macro_data":           "fred",       # FRED_API_KEY 필요
    "prediction_markets":   "polymarket", # 키 불필요
},
"tool_vendors": {
    # "get_stock_data": "alpha_vantage",   # 도구별 오버라이드
},
```

`dataflows/config.set_config()`는 딕셔너리 값을 가진 키를 **한 단계 깊이까지** 병합하므로,
`{"data_vendors": {"core_stock_apis": "alpha_vantage"}}`를 넘겨도 나머지
다섯 카테고리 항목은 기본값을 유지한다.

## 데이터 벤더 전환

```python
# 카테고리 전체
"data_vendors": {"core_stock_apis": "alpha_vantage"}

# 순서가 있는 폴백 체인
"data_vendors": {"news_data": "yfinance,alpha_vantage"}

# 도구 하나
"tool_vendors": {"get_stock_data": "alpha_vantage"}
```

Alpha Vantage에는 `ALPHA_VANTAGE_API_KEY`가, FRED에는 `FRED_API_KEY`(무료)가
필요하다. Polymarket은 키가 필요 없다.

## 새 도구 추가

### 1단계 — 벤더 함수 구현

`tradingagents/dataflows/{vendor}.py`에서 **포맷된 문자열**을 반환한다(LLM이
직접 읽는다). 빈 값을 반환하는 대신 타입이 정해진 오류를 던진다:

```python
from .errors import NoMarketDataError, VendorNotConfiguredError, VendorRateLimitError

def get_new_data(ticker: str, curr_date: str) -> str:
    if not os.getenv("MY_API_KEY"):
        raise VendorNotConfiguredError("MY_API_KEY is not set")
    rows = _fetch(ticker, curr_date)
    if rows.empty:
        raise NoMarketDataError(ticker, canonical=normalize_symbol(ticker),
                                detail="vendor returned no rows")
    return _render_markdown(rows)
```

### 2단계 — `dataflows/interface.py`에 등록

```python
from .my_vendor import get_new_data as get_my_vendor_new_data

TOOLS_CATEGORIES["new_category"] = {
    "description": "What this data is",
    "tools": ["get_new_data"],
}
VENDOR_LIST.append("my_vendor")
VENDOR_METHODS["get_new_data"] = {"my_vendor": get_my_vendor_new_data}
# 선택적 보강 데이터인 경우에만:
# OPTIONAL_CATEGORIES.add("new_category")
```

`get_category_for_method()`는 메서드가 어느 카테고리에도 없으면 `ValueError`를 내므로,
`TOOLS_CATEGORIES` 항목을 빠뜨리면 라우팅이 깨진다.

### 3단계 — `@tool` 래퍼 추가

`agents/utils/`에 새 파일을 만든다(기존 배치대로 카테고리당 하나):

```python
from typing import Annotated
from langchain_core.tools import tool
from tradingagents.dataflows.interface import route_to_vendor

@tool
def get_new_data(
    ticker: Annotated[str, "Ticker symbol"],
    curr_date: Annotated[str, "Current date in yyyy-mm-dd format"],
) -> str:
    """One-line purpose. Uses the configured new_category vendor.

    Args:
        ticker (str): Ticker symbol
        curr_date (str): Current date in yyyy-mm-dd format
    Returns:
        str: A formatted string containing ...
    """
    return route_to_vendor("get_new_data", ticker, curr_date)
```

### 4단계 — `agent_utils.py`에서 export

임포트 **그리고** `__all__` 항목을 모두 추가한다.

### 5단계 — 에이전트에 바인딩

애널리스트 파일에서 로컬 `tools = [...]` 리스트에 추가한다.

### 6단계 — 도구 노드에 추가

`graph/trading_graph.py::_create_tool_nodes()`에서 해당하는
`ToolNode([...])`에 추가한다. **LLM에는 바인딩되었지만 ToolNode에 없는 도구는
실행 시점에 실패하고**, 모델은 데이터가 "사용 불가"라고 보고한다.

### 7단계 — 시스템 프롬프트 갱신

애널리스트의 `system_message`에 도구 이름과 시그니처를 적는다. 뉴스
애널리스트의 프롬프트가 본보기다. 모든 도구 시그니처와 유효한
`get_macro_indicators` 키를 일일이 적어 두었다. 프롬프트에 언급되지 않은 도구는 거의 호출되지 않는다.

### 8단계 — 설정 기본값 추가

`default_config.py`의 `data_vendors`에 카테고리를 추가하고 선택지 주석을 단다.

## 매크로 지표 추가

별칭은 `dataflows/fred.py::MACRO_SERIES`(별칭 → FRED 시리즈 ID)에 있다.
맵에 없는 것은 **원시 FRED 시리즈 ID 그대로** 전달되므로, 파워 유저가
큐레이션된 집합에 갇히는 일은 없다. 별칭을 추가한 뒤에는
`agents/analysts/news_analyst.py`의 뉴스 애널리스트 프롬프트 목록에도 추가해야 한다.
그러지 않으면 모델은 그 존재를 모른다.

FRED 노브: `DEFAULT_LOOKBACK_DAYS = 365`, `MAX_ROWS = 40`,
`REQUEST_TIMEOUT = 30`.

## 센티먼트 소스 추가

Sentiment Analyst는 도구 호출을 **쓰지 않는다** — 미리 가져와서 주입한다.
네 번째 소스를 추가하려면:

1. `dataflows/x.py`에 `fetch_x(ticker, ...) -> str`를 작성한다. 이 함수는
   **우아하게 격하되고 절대 예외를 던지지 않아야 한다** — 애널리스트가 아무런
   보호 없이 호출하므로 실패 시 `<unavailable>` 형태의 자리표시자를 반환한다.
2. `sentiment_analyst_node`에서 호출하고 그 블록을
   `_build_system_message(...)`로 넘긴다.
3. `_build_system_message`에 `<start_of_x>` / `<end_of_x>` 블록과 해석 가이드라인을
   추가하고, `agents/schemas.py::SentimentReport`의 `narrative` 필드 설명에도
   그 소스를 언급한다.

## 검증

```bash
python3 -c "
from tradingagents.dataflows.interface import (
    TOOLS_CATEGORIES, VENDOR_METHODS, get_category_for_method)
for cat, info in TOOLS_CATEGORIES.items():
    for t in info['tools']:
        assert t in VENDOR_METHODS, f'{t} missing from VENDOR_METHODS'
        assert get_category_for_method(t) == cat
print('routing tables consistent:', sum(len(i['tools']) for i in TOOLS_CATEGORIES.values()), 'tools')
"
python3 -c "
from tradingagents.agents.utils import agent_utils as au
print(len(au.__all__), 'exports'); print([n for n in au.__all__ if n.startswith('get_')])
"
pytest tests/test_vendor_routing.py tests/test_vendor_errors.py \
       tests/test_dataflows_config.py tests/test_no_data_handling.py \
       tests/test_fred.py tests/test_polymarket.py -q
```

`get_verified_market_snapshot`은 의도적으로 `VENDOR_METHODS`에 없다는 점에
유의한다 — 라우팅을 우회하기 때문이다. "모든 도구는 라우팅된다" 식의 단언에서는
제외해야 한다.

## 추가 자료

- **`references/dataflows.md`** — 모듈별 지도, 벤더 구현 상세,
  캐싱, 심볼 정규화, 검증된 스냅샷 경로
