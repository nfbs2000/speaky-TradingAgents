# 7장: 데이터 공급자와 근거

## LLM보다 먼저 데이터 계약을 읽어야 한다

금융 agent가 자신감 있게 말해도 입력 데이터가 없거나 잘못된 종목을 읽었다면 결과는
무의미하다. TradingAgents의 dataflow 계층은 tool 이름과 실제 vendor 구현 사이를
명시적으로 연결한다.

## 도구 범주

| 범주 | 도구 | 기본 공급자 |
|---|---|---|
| 가격 | `get_stock_data` | yfinance |
| 기술 지표 | `get_indicators` | yfinance |
| 재무 | fundamentals, balance sheet, cashflow, income | yfinance |
| 뉴스 | ticker, global, insider | yfinance |
| 거시경제 | `get_macro_indicators` | FRED |
| 예측시장 | `get_prediction_markets` | Polymarket |

Alpha Vantage는 가격·지표·재무·뉴스의 대체 구현을 제공한다. config는 범주 단위 공급자를
정하고, `tool_vendors`는 특정 tool만 덮어쓸 수 있다.

## 명시하지 않은 fallback은 사용하지 않는다

`route_to_vendor()`의 핵심 규칙은 단순하다.

```text
configured: "yfinance"
  -> yfinance만 호출

configured: "yfinance,alpha_vantage"
  -> 적힌 순서로 호출

configured: "default"
  -> 해당 method의 모든 구현 사용
```

과거처럼 primary가 실패했다고 사용자가 고르지 않은 공급자로 조용히 바꾸면, 한 보고서 안에
서로 다른 기준과 시점의 숫자가 섞일 수 있다. 현재 코드는 explicit vendor list 자체를
fallback chain으로 취급한다.

<div class="mermaid">
flowchart TD
    M["tool method"] --> C["category·tool config"]
    C --> V["명시된 vendor chain"]
    V --> R{"응답"}
    R -- "정상" --> O["결과 반환"]
    R -- "rate limit·미설정" --> N["다음 명시 vendor"]
    R -- "NO DATA" --> Z["NO_DATA_AVAILABLE"]
    R -- "core error" --> E["오류 노출"]
    R -- "optional error" --> D["DATA_UNAVAILABLE 후 계속"]
</div>

## 실패를 어떻게 표현하는가

### `NoMarketDataError`

모든 공급자가 해당 symbol에 쓸 수 있는 데이터를 찾지 못하면
`NO_DATA_AVAILABLE` sentinel을 반환한다. canonical symbol, stale 여부와 구체적인 이유도
붙는다. prompt는 이 문자열을 보고 값을 추정하지 말아야 한다.

### core category 오류

가격·재무·뉴스처럼 결정의 핵심인 범주에서 network나 auth 오류가 나면 실제 exception을
올린다. 빈 자료로 성공한 것처럼 계속하지 않는다.

### optional enrichment 오류

거시경제와 예측시장은 보조 맥락이다. 실패하면 `DATA_UNAVAILABLE`을 반환하고 agent가 그
자료 없이 진행하게 한다. 이 경우에도 log에는 원래 오류가 남는다.

<div class="truth-note">
<strong>fallback과 조작의 경계</strong>
사용자가 명시한 순서 안에서 다음 공급자를 시도하는 것은 데이터 계약이다. 설정에 없는
공급자를 몰래 사용하거나 빈 결과를 모델이 채우게 하는 것은 계약 위반이다.
</div>

## ticker identity와 verified snapshot

분석 시작 시 종목 identity를 결정적으로 확인해 `instrument_context`를 만든다. 예를 들어
ticker만 보고 모델이 다른 회사를 떠올리는 일을 줄인다.

Market Analyst는 별도로 verified snapshot을 호출해 정확한 가격·거래량·지표 수치를
고정한다. 따라서 세 층이 있다.

1. symbol normalization
2. instrument identity
3. 분석 날짜 기준 verified market snapshot

이 세 단계가 있어도 미래 수익률이나 뉴스의 해석이 정답이 되는 것은 아니다. 다만 “어느
종목의 어떤 수치를 분석했는가”를 더 안정적으로 만든다.

## 날짜와 look-ahead

과거 날짜를 분석할 때 미래 정보가 들어가면 backtest 의미가 깨진다. 프로젝트는 뉴스와
Alpha Vantage fundamentals에서 분석 날짜 경계를 지키려는 필터를 갖고 있다. 그러나 live
뉴스·소셜 source가 시간이 지나며 달라지는 문제까지 사라지는 것은 아니다.

## 핵심 정리

- tool 이름과 vendor 구현은 중앙 routing table로 연결된다.
- fallback은 설정에 적힌 공급자 안에서만 일어난다.
- 핵심 데이터 실패는 오류로, 선택 데이터 실패는 명시적 sentinel로 남는다.
- ticker identity와 verified snapshot은 정확한 대상·숫자를 고정한다.
- 데이터 grounding은 판단의 재현성을 돕지만 시장 예측의 정확성을 보증하지 않는다.

## 원본 소스

- [`dataflows/interface.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/dataflows/interface.py)
- [`default_config.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/default_config.py)
- [`market data errors`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/dataflows/errors.py)
- [`symbol utilities`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/dataflows/symbol_utils.py)
- [`market data validator`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/dataflows/market_data_validator.py)
