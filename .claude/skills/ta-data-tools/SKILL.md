---
name: ta-data-tools
description: This skill should be used when the user asks to "add data source", "create data tool", "switch data vendor", "add technical indicator", "new API integration", "change from yfinance to alpha vantage", "add crypto data", "create custom tool", "modify data tool", "add macro indicator", "FRED", "polymarket", "stocktwits", "reddit sentiment source", or wants to add or modify data tools and sources in TradingAgents.
version: 0.2.0
---

# TradingAgents Data Tools

Add, modify, and configure data tools and sources for the TradingAgents system.

## Current Tool Inventory

11 LangChain `@tool` functions live in `tradingagents/agents/utils/`:

| Tool | File | Category | Used By | Vendors |
|------|------|----------|---------|---------|
| `get_stock_data` | `core_stock_tools.py` | `core_stock_apis` | Market | yfinance, alpha_vantage |
| `get_indicators` | `technical_indicators_tools.py` | `technical_indicators` | Market | yfinance, alpha_vantage |
| `get_fundamentals` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_balance_sheet` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_cashflow` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_income_statement` | `fundamental_data_tools.py` | `fundamental_data` | Fundamentals | yfinance, alpha_vantage |
| `get_news` | `news_data_tools.py` | `news_data` | News (+ Sentiment, direct call) | yfinance, alpha_vantage |
| `get_global_news` | `news_data_tools.py` | `news_data` | News | yfinance, alpha_vantage |
| `get_insider_transactions` | `news_data_tools.py` | `news_data` | News (bound) | yfinance, alpha_vantage |
| `get_macro_indicators` | `macro_data_tools.py` | `macro_data` | News | **fred** only |
| `get_prediction_markets` | `prediction_markets_tools.py` | `prediction_markets` | News | **polymarket** only |

Plus one tool that bypasses vendor routing entirely:

| `get_verified_market_snapshot` | `market_data_validation_tools.py` | — | Market | calls `market_data_validator` directly |

And two fetchers that are **not** tools — the Sentiment Analyst calls them as plain
functions and injects the results into its prompt:

| `fetch_stocktwits_messages(ticker, limit=30)` | `dataflows/stocktwits.py` |
| `fetch_reddit_posts(ticker)` | `dataflows/reddit.py` |

## Architecture

### Three Layers

```
agents/utils/*_tools.py     @tool wrappers — signature + docstring only
        ↓ route_to_vendor(method, *args)
dataflows/interface.py      registry: TOOLS_CATEGORIES, VENDOR_METHODS, routing + fallback
        ↓
dataflows/{y_finance,alpha_vantage_*,fred,polymarket}.py   vendor implementations
```

`agents/utils/agent_utils.py` is the re-export registry (`__all__`) that agents and
`trading_graph._create_tool_nodes()` import from. It re-exports the 11 tools plus
`build_instrument_context`, `resolve_instrument_identity`,
`get_instrument_context_from_state`, `get_language_instruction`, `create_msg_delete`.

### Tool wrappers are thin

Every tool body is a single `route_to_vendor` call. **There is no per-tool
`if vendor == ...` ladder** — vendor dispatch is centralized:

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

The docstring **is** the LLM-facing tool description — write it for the model.

### Vendor Routing (`dataflows/interface.py`)

Three module-level tables:

```python
TOOLS_CATEGORIES = { "core_stock_apis": {"description": ..., "tools": [...]}, ... }
VENDOR_LIST      = ["yfinance", "fred", "polymarket", "alpha_vantage"]
VENDOR_METHODS   = { "get_stock_data": {"alpha_vantage": ..., "yfinance": ...}, ... }
OPTIONAL_CATEGORIES = {"macro_data", "prediction_markets"}
```

`get_vendor(category, method)` — tool-level `tool_vendors[method]` wins over
category-level `data_vendors[category]`; falls back to the string `"default"`.

`route_to_vendor(method, *args, **kwargs)`:

1. Resolve category → vendor config string, split on `,` into a chain.
2. **The configured list IS the chain.** Vendors you did not name are never used
   (upstream #988/#289). Naming an unavailable vendor raises `ValueError`. The
   `"default"` sentinel means "all available vendors for this method".
3. Try each vendor in order, reacting by exception **type** (`dataflows/errors.py`):

| Exception | Reaction |
|-----------|----------|
| `VendorRateLimitError` | log warning, try next vendor |
| `VendorNotConfiguredError` | log warning, remember as `first_error`, try next |
| `NoMarketDataError` | remember as `last_no_data`, try next |
| any other `Exception` | log warning, remember as `first_error`, try next |

4. Outcome precedence: if any vendor reported `NoMarketDataError`, return the
   `NO_DATA_AVAILABLE: ...` sentinel string (includes requested vs canonical
   symbol and the `detail`, and explicitly instructs the model not to fabricate).
   Else if `first_error` and the category is in `OPTIONAL_CATEGORIES`, return the
   `DATA_UNAVAILABLE: ...` sentinel. Else **raise** `first_error`.

The split matters: a broken price or fundamentals vendor is loud; a broken macro or
prediction-market vendor degrades to a sentinel so flavour data cannot abort a run.

### Data Vendor Config (`default_config.py`)

```python
"data_vendors": {
    "core_stock_apis":      "yfinance",   # alpha_vantage, yfinance
    "technical_indicators": "yfinance",   # alpha_vantage, yfinance
    "fundamental_data":     "yfinance",   # alpha_vantage, yfinance
    "news_data":            "yfinance",   # alpha_vantage, yfinance
    "macro_data":           "fred",       # needs FRED_API_KEY
    "prediction_markets":   "polymarket", # keyless
},
"tool_vendors": {
    # "get_stock_data": "alpha_vantage",   # per-tool override
},
```

`dataflows/config.set_config()` merges dict-valued keys **one level deep**, so
passing `{"data_vendors": {"core_stock_apis": "alpha_vantage"}}` keeps the other
five category entries at their defaults.

## Switching Data Vendors

```python
# whole category
"data_vendors": {"core_stock_apis": "alpha_vantage"}

# ordered fallback chain
"data_vendors": {"news_data": "yfinance,alpha_vantage"}

# single tool
"tool_vendors": {"get_stock_data": "alpha_vantage"}
```

Alpha Vantage needs `ALPHA_VANTAGE_API_KEY`; FRED needs `FRED_API_KEY`
(free); Polymarket is keyless.

## Adding a New Tool

### Step 1 — implement the vendor function

In `tradingagents/dataflows/{vendor}.py`, returning a **formatted string** (the LLM
reads it directly). Raise the typed errors rather than returning empty:

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

### Step 2 — register in `dataflows/interface.py`

```python
from .my_vendor import get_new_data as get_my_vendor_new_data

TOOLS_CATEGORIES["new_category"] = {
    "description": "What this data is",
    "tools": ["get_new_data"],
}
VENDOR_LIST.append("my_vendor")
VENDOR_METHODS["get_new_data"] = {"my_vendor": get_my_vendor_new_data}
# Optional-enrichment data only:
# OPTIONAL_CATEGORIES.add("new_category")
```

`get_category_for_method()` raises `ValueError` if the method is in no category, so
skipping the `TOOLS_CATEGORIES` entry breaks routing.

### Step 3 — add the `@tool` wrapper

New file in `agents/utils/` (one per category, matching the existing layout):

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

### Step 4 — export from `agent_utils.py`

Add the import **and** the `__all__` entry.

### Step 5 — bind to an agent

In the analyst file, add to its local `tools = [...]` list.

### Step 6 — add to the tool node

In `graph/trading_graph.py::_create_tool_nodes()`, add it to the matching
`ToolNode([...])`. **A tool bound to the LLM but missing from the ToolNode fails at
execution time** and the model reports the data "unavailable".

### Step 7 — update the system prompt

Name the tool and its signature in the analyst's `system_message`. The news
analyst's prompt is the model to copy — it spells out every tool signature and the
valid `get_macro_indicators` keys. A tool the prompt never mentions is rarely called.

### Step 8 — add config defaults

Add the category to `data_vendors` in `default_config.py` with an options comment.

## Adding a Macro Indicator

Aliases live in `dataflows/fred.py::MACRO_SERIES` (alias → FRED series ID).
Anything not in the map is passed through **verbatim as a raw FRED series ID**, so
power users are never limited to the curated set. After adding an alias, add it to
the news analyst's prompt list in `agents/analysts/news_analyst.py` or the model
will not know it exists.

FRED knobs: `DEFAULT_LOOKBACK_DAYS = 365`, `MAX_ROWS = 40`,
`REQUEST_TIMEOUT = 30`.

## Adding a Sentiment Source

The Sentiment Analyst does **not** use tool-calling — it pre-fetches and injects.
To add a fourth source:

1. Write `fetch_x(ticker, ...) -> str` in `dataflows/x.py`. It must **degrade
   gracefully and never raise** — return an `<unavailable>`-style placeholder,
   because the analyst calls it unguarded.
2. Call it in `sentiment_analyst_node` and pass the block into
   `_build_system_message(...)`.
3. Add a `<start_of_x>` / `<end_of_x>` block and an interpretation guideline to
   `_build_system_message`, and mention the source in the `narrative` field
   description in `agents/schemas.py::SentimentReport`.

## Validation

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

Note `get_verified_market_snapshot` is intentionally absent from
`VENDOR_METHODS` — it bypasses routing — so exclude it from any
"every tool is routed" assertion.

## Additional Resources

- **`references/dataflows.md`** — per-module map, vendor implementation details,
  caching, symbol normalization, and the verified-snapshot path
