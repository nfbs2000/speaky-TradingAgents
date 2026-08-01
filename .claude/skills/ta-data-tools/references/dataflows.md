# Dataflows 구조

## 디렉터리 지도

```
tradingagents/dataflows/
├── __init__.py                    (비어 있음)
├── config.py                 41   get_config / set_config / initialize_config
├── errors.py                 55   VendorError 분류 체계
├── interface.py             262   TOOLS_CATEGORIES, VENDOR_METHODS, route_to_vendor
├── utils.py                  75   safe_ticker_component, get_next_weekday, ...
├── symbol_utils.py          143   normalize_symbol, crypto_base, is_yahoo_safe
├── y_finance.py             470   yfinance: OHLCV, 재무, 재무제표, 내부자 거래
├── yfinance_news.py         232   yfinance 뉴스 + 글로벌 뉴스
├── stockstats_utils.py      261   OHLCV 캐시 + stockstats 지표 + 신선도 가드
├── market_data_validator.py 123   결정론적 검증 스냅샷
├── fred.py                  237   FRED 매크로 벤더
├── polymarket.py            139   Polymarket 예측시장 벤더
├── stocktwits.py             96   StockTwits 페처 (도구 아님)
├── reddit.py                250   Reddit 페처 (도구 아님)
├── alpha_vantage.py           23   재export 파사드
├── alpha_vantage_common.py   151   공용 HTTP 클라이언트, 키 처리, 오류 매핑
├── alpha_vantage_stock.py     40   TIME_SERIES_DAILY
├── alpha_vantage_indicator.py 215  지표 엔드포인트
├── alpha_vantage_fundamentals.py 64  OVERVIEW / BALANCE_SHEET / CASH_FLOW / INCOME_STATEMENT
└── alpha_vantage_news.py      72   NEWS_SENTIMENT
```

## 벤더 카테고리 → 도구 매핑

| 카테고리 (`data_vendors` 키) | 도구 | 사용 가능 벤더 |
|---|---|---|
| `core_stock_apis` | `get_stock_data` | alpha_vantage, yfinance |
| `technical_indicators` | `get_indicators` | alpha_vantage, yfinance |
| `fundamental_data` | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement` | alpha_vantage, yfinance |
| `news_data` | `get_news`, `get_global_news`, `get_insider_transactions` | alpha_vantage, yfinance |
| `macro_data` | `get_macro_indicators` | fred |
| `prediction_markets` | `get_prediction_markets` | polymarket |

`OPTIONAL_CATEGORIES = {"macro_data", "prediction_markets"}` — 여기서 실패하면
예외를 던지는 대신 `DATA_UNAVAILABLE:` 센티널을 반환한다.

## `VENDOR_METHODS` → 구현

| 메서드 | yfinance | alpha_vantage |
|---|---|---|
| `get_stock_data` | `y_finance.get_YFin_data_online` | `alpha_vantage.get_stock` |
| `get_indicators` | `y_finance.get_stock_stats_indicators_window` | `alpha_vantage.get_indicator` |
| `get_fundamentals` | `y_finance.get_fundamentals` | `alpha_vantage.get_fundamentals` |
| `get_balance_sheet` | `y_finance.get_balance_sheet` | `alpha_vantage.get_balance_sheet` |
| `get_cashflow` | `y_finance.get_cashflow` | `alpha_vantage.get_cashflow` |
| `get_income_statement` | `y_finance.get_income_statement` | `alpha_vantage.get_income_statement` |
| `get_news` | `yfinance_news.get_news_yfinance` | `alpha_vantage.get_news` |
| `get_global_news` | `yfinance_news.get_global_news_yfinance` | `alpha_vantage.get_global_news` |
| `get_insider_transactions` | `y_finance.get_insider_transactions` | `alpha_vantage.get_insider_transactions` |
| `get_macro_indicators` | — | `fred.get_macro_data` |
| `get_prediction_markets` | — | `polymarket.get_prediction_markets` |

`route_to_vendor`는 `VENDOR_METHODS[method][vendor]`의 값으로 **리스트**도 받으며
원소 `[0]`을 취한다 — 벤더별 변형을 위한 훅이다. 현재 항목은 모두 평범한 콜러블이다.

## 오류 분류 체계 (`errors.py`)

```
VendorError
├── NoMarketDataError(symbol, canonical=None, detail="")   쓸 수 있는 행 없음: 비었거나 낡음
├── VendorRateLimitError                                   일시적 스로틀
└── VendorNotConfiguredError  (ValueError이기도 함)         키/설정 누락
```

타입의 개수는 사람이 설명할 수 있는 원인의 수가 아니라 **라우터의 서로 다른 반응**의
수와 같다. 빈 데이터와 낡은 데이터는 동일하게 처리되므로 `NoMarketDataError`를
공유하고 `detail`로만 구분된다. 새 벤더는 이 오류들(또는 얇은 서브클래스)을 던지면
되고, 라우터에 새 `except` 절을 추가할 필요가 없다.

`NoMarketDataError`는 요청된 `symbol`과 실제로 조회한 `canonical` 심볼을 모두 담으며,
덕분에 라우터가 다음과 같이 알릴 수 있다:
`No usable market data for 'XAUUSD' (resolved to 'GC=F') from any configured
vendor (latest row is 2025-06-11 ... stale)`.

## OHLCV 캐시와 신선도 가드 (`stockstats_utils.py`)

`load_ohlcv(symbol, curr_date) -> pd.DataFrame`는 지표 경로와 검증 스냅샷이 함께 쓰는
공용 가격 로더다.

- 오늘까지 약 5년치를 내려받아 `config["data_cache_dir"]`(기본
  `~/.tradingagents/cache`) 아래에 **심볼당 하루당 CSV 하나**로 캐시한다.
- 심볼은 파일명에 삽입되기 전에 `utils.safe_ticker_component()`를 거치므로,
  악의적인 티커가 캐시 디렉터리를 벗어날 수 없다.
- 비어 있거나 컬럼이 없는 캐시 파일(이전 페치 실패)은 "데이터 없음"이 아니라
  **미스**로 친다.
- `_needs_same_day_refresh()`: 캐시 파일은 날짜별로 키가 잡히므로, 장 마감 전에
  시작해서 마감 후까지 이어진 실행은 그러지 않으면 낡은 당일 데이터를 제공하게 된다.
  이 규칙에 따라 당일 요청은 다시 가져오고, 과거 요청은 항상 캐시를 재사용한다.
- `_assert_ohlcv_not_stale()`은 조용히 옛 가격을 반환하는 대신 최신 행의 날짜를
  담은 `detail`과 함께 `NoMarketDataError`를 던진다.
- `yf_retry(func, max_retries=3, base_delay=2.0)`는 yfinance 호출을 지수 백오프로 감싼다.
- `_ensure_date_column` / `_coerce_ohlcv_dates`는 버전마다 다른 yfinance의
  인덱스 대 컬럼 불일치를 정규화한다.

## 심볼 정규화 (`symbol_utils.py`)

- `normalize_symbol(raw)`는 `_ALIASES`(예: `XAUUSD` → `GC=F`)와 암호화폐 처리를 통해
  사용자 입력을 Yahoo에서 안전한 심볼로 매핑한다.
- `crypto_base(raw)` / `_normalize_crypto(s)`는 `BTCUSDT` 형태의 페어를 `BTC-USD`로 처리한다.
- `is_yahoo_safe(symbol)`은 애초에 그 심볼을 조회할 수 있는지 판단한다.

벤더들뿐 아니라 `TradingAgentsGraph._fetch_returns()`도 이를 사용하므로,
실현 수익률 조회가 분석에서 가격을 매긴 것과 동일한 종목을 대상으로 한다(upstream #984).

## 검증된 마켓 스냅샷 (`market_data_validator.py`)

벤더 라우팅을 우회한다: `get_verified_market_snapshot` →
`build_verified_market_snapshot()` → `load_ohlcv()` + `stockstats.wrap`.

결정론적이며 LLM을 쓰지 않는다. 분석 날짜 이전 또는 당일의 가장 최근 OHLCV 행,
최근 종가들, 그리고 **고정된** 지표 집합을 반환하므로 스냅샷의 형태가 매 실행마다 같다:

```python
DEFAULT_SNAPSHOT_INDICATORS = (
    "close_10_ema", "close_50_sma", "close_200_sma",
    "rsi", "boll", "boll_ub", "boll_lb",
    "macd", "macds", "macdh", "atr",
)
```

이것이 존재하는 이유는 마켓 애널리스트가 정확한 수치를 지어낼 수 있기 때문이다.
데이터가 뒷받침하지 않는 볼린저 밴드 값이나 "역사적으로 검증된 반등" 같은 것들이다
(upstream #830). 애널리스트의 프롬프트는 정확한 OHLCV / 가격 수준 / 지표 주장에
대해 이 스냅샷을 진실의 원천으로 지정하며, 충돌이 있으면 임의로 조정하지 말고
표시하라고 요구한다.

## Alpha Vantage

`ALPHA_VANTAGE_API_KEY`가 필요하다. `alpha_vantage.py`는 네 개의 구현 모듈 위에
놓인 재export 파사드다. `alpha_vantage_common.py`가 공용 HTTP 클라이언트, 타임아웃,
키 해석, 그리고 AV의 오류/한도 페이로드를 `errors.py` 분류 체계로 매핑하는 일을
담당한다(특히 rate-limit 안내 → `VendorRateLimitError`. 이것이
`"yfinance,alpha_vantage"` 체인을 유용하게 만든다).

## FRED (`fred.py`)

- 키: `FRED_API_KEY`(무료). 미설정 시 `VendorNotConfiguredError`가 발생하므로,
  라우팅은 이를 크래시가 아니라 "사용 불가"로 취급한다.
- `MACRO_SERIES`는 정책금리·국채, 인플레이션, 성장, 고용, 통화·시장, 심리·주택에
  걸쳐 약 30개의 친숙한 별칭을 FRED 시리즈 ID로 매핑한다.
- **알 수 없는 키는 원시 FRED 시리즈 ID로 그대로 전달된다** — 큐레이션된 맵은
  편의 장치이지 화이트리스트가 아니다.
- `DEFAULT_LOOKBACK_DAYS = 365`, `MAX_ROWS = 40`(최근 값이 가장 중요하고, 긴 기간의
  일별 시리즈는 컨텍스트를 넘치게 한다), `REQUEST_TIMEOUT = 30`.

## Polymarket (`polymarket.py`)

키가 필요 없다. `get_prediction_markets(topic, limit=None)`은 주제로 마켓을 검색하고
`_is_forward_looking(market, now)`으로 미래를 향한 것만 걸러 내어, 시장이 함의하는
확률을 반환한다.

## 센티먼트 페처 (도구 아님)

`stocktwits.py::fetch_stocktwits_messages(ticker, limit=30, timeout=10.0)` —
사용자가 직접 붙인 Bullish/Bearish 태그가 달린, 캐시태그로 색인된 개인투자자 메시지.
`_stocktwits_symbol()`이 티커를 StockTwits의 캐시태그 형식으로 맞춘다.

`reddit.py::fetch_reddit_posts(ticker, ...)` — r/wallstreetbets, r/stocks,
r/investing. RSS(`_fetch_subreddit_rss`)를 먼저 시도하고 JSON
(`_fetch_subreddit_json`)으로 폴백한다. `_retry_after_seconds()`로 `Retry-After`를
존중하며, 게시물 본문에서 HTML을 제거한다.

둘 다 `sentiment_analyst_node`가 직접 호출하며 **절대 예외를 던져서는 안 된다** —
호출부가 보호하지 않으므로 실패 시 자리표시자 문자열을 반환한다.
그 출력은 `<start_of_*>` / `<end_of_*>` 블록 안에 담겨 프롬프트로 주입된다.

## 뉴스 설정 노브 (`default_config.py`)

```python
"news_article_limit": 20,            # 종목별 뉴스
"global_news_article_limit": 10,     # 글로벌/매크로 뉴스
"global_news_lookback_days": 7,      # 매크로 조회 기간
"global_news_queries": [ ... 5 macro search strings ... ],
```

`get_global_news(curr_date, look_back_days=None, limit=None)`은 인자를 생략하면
이 값들을 물려받는다. 도구 시그니처가 둘 다 `int | None`로 표시하므로 LLM이 생략할 수 있다.

## 새 데이터 벤더 추가

1. `tradingagents/dataflows/{vendor}.py`를 만든다. 포맷된 문자열을 반환하고,
   빈 결과를 반환하는 대신 `errors.py`의 타입을 던진다.
2. `interface.py`에서 관련된 각 `VENDOR_METHODS[method]` 딕셔너리에 콜러블을
   추가하고, `VENDOR_LIST`에 벤더 이름을 덧붙인다.
3. `default_config.py`의 `data_vendors` 주석에 선택지를 문서화한다.
4. 벤더에 키가 필요하면 벤더 모듈 안에서 환경변수로 읽고, 없으면
   `VendorNotConfiguredError`를 던진다. 비밀 값을 위한 설정 키를 추가하지 **말라**.
5. 교체가 아니라 폴백으로 쓰이게 하려면 사용자가
   `"news_data": "yfinance,{vendor}"`처럼 설정한다. 단일 벤더 설정은 절대 조용히
   당신의 벤더로 넘어가지 않는다.

## 캐시 디렉터리

`config["data_cache_dir"]` — 기본값 `~/.tradingagents/cache`,
`TRADINGAGENTS_CACHE_DIR`로 덮어쓴다. 심볼별 OHLCV CSV와,
(`checkpoint_enabled`일 때) 종목별 LangGraph SQLite 체크포인트 DB를 담는다.
`TradingAgentsGraph.__init__`이 이 디렉터리를 만든다.
