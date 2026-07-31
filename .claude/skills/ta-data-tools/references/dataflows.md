# Dataflows Architecture

## Directory Map

```
tradingagents/dataflows/
├── __init__.py                    (empty)
├── config.py                 41   get_config / set_config / initialize_config
├── errors.py                 55   VendorError taxonomy
├── interface.py             262   TOOLS_CATEGORIES, VENDOR_METHODS, route_to_vendor
├── utils.py                  75   safe_ticker_component, get_next_weekday, ...
├── symbol_utils.py          143   normalize_symbol, crypto_base, is_yahoo_safe
├── y_finance.py             470   yfinance: OHLCV, fundamentals, statements, insiders
├── yfinance_news.py         232   yfinance news + global news
├── stockstats_utils.py      261   OHLCV cache + stockstats indicators + staleness guard
├── market_data_validator.py 123   deterministic verification snapshot
├── fred.py                  237   FRED macro vendor
├── polymarket.py            139   Polymarket prediction-market vendor
├── stocktwits.py             96   StockTwits fetcher (not a tool)
├── reddit.py                250   Reddit fetcher (not a tool)
├── alpha_vantage.py           23   re-export facade
├── alpha_vantage_common.py   151   shared HTTP client, key handling, error mapping
├── alpha_vantage_stock.py     40   TIME_SERIES_DAILY
├── alpha_vantage_indicator.py 215  indicator endpoints
├── alpha_vantage_fundamentals.py 64  OVERVIEW / BALANCE_SHEET / CASH_FLOW / INCOME_STATEMENT
└── alpha_vantage_news.py      72   NEWS_SENTIMENT
```

## Vendor Category → Tool Mapping

| Category (`data_vendors` key) | Tools | Available vendors |
|---|---|---|
| `core_stock_apis` | `get_stock_data` | alpha_vantage, yfinance |
| `technical_indicators` | `get_indicators` | alpha_vantage, yfinance |
| `fundamental_data` | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement` | alpha_vantage, yfinance |
| `news_data` | `get_news`, `get_global_news`, `get_insider_transactions` | alpha_vantage, yfinance |
| `macro_data` | `get_macro_indicators` | fred |
| `prediction_markets` | `get_prediction_markets` | polymarket |

`OPTIONAL_CATEGORIES = {"macro_data", "prediction_markets"}` — failures in these
return a `DATA_UNAVAILABLE:` sentinel instead of raising.

## `VENDOR_METHODS` → implementation

| method | yfinance | alpha_vantage |
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

`route_to_vendor` also accepts a **list** value in `VENDOR_METHODS[method][vendor]`
and takes element `[0]` — a hook for per-vendor variants; all current entries are
plain callables.

## Error Taxonomy (`errors.py`)

```
VendorError
├── NoMarketDataError(symbol, canonical=None, detail="")   no usable rows: empty OR stale
├── VendorRateLimitError                                   transient throttle
└── VendorNotConfiguredError  (also a ValueError)          missing key/config
```

The number of types equals the number of distinct **router reactions**, not the
number of human-describable causes — empty and stale data get identical handling, so
they share `NoMarketDataError` and differ only in `detail`. A new vendor raises
these (or a thin subclass) and needs no new `except` clause in the router.

`NoMarketDataError` carries both the requested `symbol` and the `canonical` symbol
actually queried, which is what lets the router emit
`No usable market data for 'XAUUSD' (resolved to 'GC=F') from any configured
vendor (latest row is 2025-06-11 ... stale)`.

## OHLCV Cache & Staleness Guard (`stockstats_utils.py`)

`load_ohlcv(symbol, curr_date) -> pd.DataFrame` is the shared price loader used by
the indicator path and the verification snapshot.

- Downloads ~5 years up to today, caches **one CSV per symbol per day** under
  `config["data_cache_dir"]` (default `~/.tradingagents/cache`).
- The symbol is passed through `utils.safe_ticker_component()` before being
  interpolated into the filename, so a hostile ticker cannot escape the cache dir.
- An empty / column-less cache file (a prior failed fetch) counts as a **miss**, not
  as "no data".
- `_needs_same_day_refresh()`: the cache file is keyed per day, so a run started
  before the market close and continued after it would otherwise serve stale
  same-day data. Current-day requests refetch under this rule; historical requests
  always reuse the cache.
- `_assert_ohlcv_not_stale()` raises `NoMarketDataError` with a `detail` naming the
  latest row date, rather than silently returning old prices.
- `yf_retry(func, max_retries=3, base_delay=2.0)` wraps yfinance calls with
  exponential backoff.
- `_ensure_date_column` / `_coerce_ohlcv_dates` normalize yfinance's index-vs-column
  inconsistency across versions.

## Symbol Normalization (`symbol_utils.py`)

- `normalize_symbol(raw)` maps user input to a Yahoo-safe symbol via `_ALIASES`
  (e.g. `XAUUSD` → `GC=F`) and crypto handling.
- `crypto_base(raw)` / `_normalize_crypto(s)` handle `BTCUSDT`-style pairs → `BTC-USD`.
- `is_yahoo_safe(symbol)` gates whether a symbol can be queried at all.

Used by the vendors **and** by `TradingAgentsGraph._fetch_returns()`, so the
realized-return lookup hits the same instrument the analysis priced (upstream #984).

## Verified Market Snapshot (`market_data_validator.py`)

Bypasses vendor routing: `get_verified_market_snapshot` →
`build_verified_market_snapshot()` → `load_ohlcv()` + `stockstats.wrap`.

Deterministic, no LLM. Returns the latest OHLCV row on or before the analysis date,
recent closes, and a **fixed** indicator set so the snapshot has the same shape
every run:

```python
DEFAULT_SNAPSHOT_INDICATORS = (
    "close_10_ema", "close_50_sma", "close_200_sma",
    "rsi", "boll", "boll_ub", "boll_lb",
    "macd", "macds", "macdh", "atr",
)
```

Exists because the market analyst can confabulate exact numbers — a Bollinger band
value or a "historically validated bounce" the data does not support (upstream #830).
The analyst's prompt names this snapshot as the source of truth for any exact OHLCV /
price-level / indicator claim and requires flagging conflicts rather than
reconciling them.

## Alpha Vantage

Needs `ALPHA_VANTAGE_API_KEY`. `alpha_vantage.py` is a re-export facade over the
four implementation modules; `alpha_vantage_common.py` owns the shared HTTP client,
timeout, key resolution, and the mapping from AV's error/limit payloads onto the
`errors.py` taxonomy (notably rate-limit notes → `VendorRateLimitError`, which is
what makes a `"yfinance,alpha_vantage"` chain useful).

## FRED (`fred.py`)

- Key: `FRED_API_KEY` (free). Unset ⇒ `VendorNotConfiguredError`, so routing treats
  it as "unavailable" rather than crashing.
- `MACRO_SERIES` maps ~30 friendly aliases → FRED series IDs across policy rates &
  Treasuries, inflation, growth, labor, money & markets, sentiment & housing.
- **Unknown keys pass through verbatim as raw FRED series IDs** — the curated map is
  a convenience, not a whitelist.
- `DEFAULT_LOOKBACK_DAYS = 365`, `MAX_ROWS = 40` (recent values matter most and a
  daily series over a long window would flood the context), `REQUEST_TIMEOUT = 30`.

## Polymarket (`polymarket.py`)

Keyless. `get_prediction_markets(topic, limit=None)` searches markets by topic and
filters to forward-looking ones via `_is_forward_looking(market, now)`, returning
market-implied probabilities.

## Sentiment Fetchers (not tools)

`stocktwits.py::fetch_stocktwits_messages(ticker, limit=30, timeout=10.0)` —
cashtag-indexed retail messages carrying user-labeled Bullish/Bearish tags.
`_stocktwits_symbol()` adapts the ticker to StockTwits' cashtag form.

`reddit.py::fetch_reddit_posts(ticker, ...)` — r/wallstreetbets, r/stocks,
r/investing. Tries RSS (`_fetch_subreddit_rss`) and falls back to JSON
(`_fetch_subreddit_json`); honors `Retry-After` via `_retry_after_seconds()`; strips
HTML from post bodies.

Both are called directly by `sentiment_analyst_node` and **must never raise** —
they return a placeholder string on failure, because the caller does not guard them.
Their output is injected into the prompt inside `<start_of_*>` / `<end_of_*>` blocks.

## News Config Knobs (`default_config.py`)

```python
"news_article_limit": 20,            # per-ticker news
"global_news_article_limit": 10,     # global/macro news
"global_news_lookback_days": 7,      # macro lookback window
"global_news_queries": [ ... 5 macro search strings ... ],
```

`get_global_news(curr_date, look_back_days=None, limit=None)` inherits these when
the arguments are omitted — the tool signature marks both `int | None` so the LLM
can leave them out.

## Adding a New Data Vendor

1. Create `tradingagents/dataflows/{vendor}.py`. Return formatted strings; raise the
   `errors.py` types instead of returning empty results.
2. Add the callable to each relevant `VENDOR_METHODS[method]` dict in
   `interface.py`, and append the vendor name to `VENDOR_LIST`.
3. Document the option in the `data_vendors` comment in `default_config.py`.
4. If the vendor needs a key, read it from the environment inside the vendor module
   and raise `VendorNotConfiguredError` when absent — do **not** add a config key
   for secrets.
5. To make it a fallback rather than a replacement, users set
   `"news_data": "yfinance,{vendor}"` — a single-vendor config never silently
   falls through to yours.

## Cache Directory

`config["data_cache_dir"]` — default `~/.tradingagents/cache`, override with
`TRADINGAGENTS_CACHE_DIR`. Holds the per-symbol OHLCV CSVs and (when
`checkpoint_enabled`) the per-ticker LangGraph SQLite checkpoint DBs.
`TradingAgentsGraph.__init__` creates it.
