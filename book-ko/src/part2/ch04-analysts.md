# 4장: 네 분석가와 도구

## 같은 LLM, 다른 정보 경계

네 분석가는 모두 “시장에 대해 말하는 모델”이 아니다. 각 node는 읽을 수 있는 데이터와
완성해야 하는 report field가 다르다.

![분석가 팀](../assets/analyst.png)

| 분석가 | 주요 입력 | 외부 데이터 경로 | state 출력 |
|---|---|---|---|
| Market | OHLCV, 기술 지표, 검증 snapshot | ToolNode 왕복 | `market_report` |
| Sentiment | 뉴스, StockTwits, Reddit | node가 먼저 수집해 prompt에 삽입 | `sentiment_report` |
| News | 종목·글로벌 뉴스, 내부자, 거시, 예측시장 | ToolNode 왕복 | `news_report` |
| Fundamentals | 개요, 대차대조표, 현금흐름, 손익계산서 | ToolNode 왕복 | `fundamentals_report` |

## Market Analyst: 숫자를 말하기 전에 검증한다

시장 분석가는 먼저 `get_stock_data`를 호출하고, 최대 여덟 개의 보완적인 지표를 고른다.
50·200일 SMA, 10일 EMA, MACD 계열, RSI, Bollinger band, ATR, VWMA가 prompt에 설명돼 있다.

중요한 안전장치는 마지막의 `get_verified_market_snapshot`이다. 정확한 OHLCV, 가격,
indicator value를 쓰기 전에 이 tool을 호출하고 다른 출력과 충돌하면 임의로 숫자를
화해시키지 말고 불일치를 표시하게 한다.

<div class="mermaid">
flowchart LR
    Q["시장 분석 prompt"] --> S["get_stock_data"]
    S --> I["get_indicators"]
    I --> V["get_verified_market_snapshot"]
    V --> C{"숫자가 충돌하는가?"}
    C -- "yes" --> F["불일치 표시"]
    C -- "no" --> R["근거 포함 market report"]
</div>

이 규칙은 모델의 금융 능력을 높이는 마법이 아니다. 정확한 숫자의 source of truth를
하나 지정해, 그보다 약한 도구 출력이나 모델 기억이 숫자를 덮지 못하게 하는 prompt 계약이다.

## Sentiment Analyst: tool call 대신 사전 수집

현재 심리 분석가는 이전 `social_media_analyst`의 이름만 바꾼 것이 아니다. 소스 주석은
과거 prompt가 소셜 분석을 요구하면서 실제로는 Yahoo 뉴스만 제공해 Reddit·X·StockTwits
내용을 지어내게 했다고 설명한다.

현재 node는 LLM 호출 전에 세 자료를 직접 수집한다.

1. Yahoo Finance 뉴스
2. ticker cashtag 기준 StockTwits 메시지와 Bullish/Bearish tag
3. `wallstreetbets`, `stocks`, `investing`의 Reddit 게시물

그다음 source별 block을 prompt에 넣고 외부 tool 호출을 금지한다. 출력은 band, 0~10 score,
confidence와 narrative를 갖는 구조화 report다. 자료가 부족하면 confidence를 낮추고
placeholder를 숨기지 않도록 지시한다.

<div class="truth-note">
<strong>좋은 수정의 형태</strong>
“소셜을 분석하라”는 prompt를 더 강하게 쓰지 않았다. 실제 데이터 수집을 prompt 앞에 두고,
없으면 없다고 말할 수 있는 구조로 바꿨다. 역할 설명과 사용 가능한 evidence를 맞춘 것이다.
</div>

## News Analyst: 사건의 범위를 넓힌다

뉴스 분석가는 종목 뉴스뿐 아니라 글로벌 뉴스, 내부자 거래, FRED 거시 지표와 Polymarket
확률을 사용할 수 있다. 하지만 모든 자료가 핵심 데이터는 아니다. 거시·예측시장처럼
선택적인 enrichment가 실패하면 `DATA_UNAVAILABLE`을 보고 계속할 수 있다.

## Fundamentals Analyst: 기업 재무를 분리한다

재무 분석가는 company fundamentals, balance sheet, cashflow와 income statement를 읽는다.
주식이 아닌 crypto asset에서는 기업 재무가 없을 수 있다. 이후 bull/bear prompt도 이
경우를 “사용 불가할 수 있는 asset fundamentals”로 표현한다.

## tool loop와 report 경계

시장·뉴스·재무 분석가는 tool call이 있는 동안 report를 비워 둔다. LLM이 더 이상 tool을
요청하지 않은 최종 응답만 report field가 된다. 이 때문에 tool을 호출하는 중간 message와
완성된 분석 보고서를 구분할 수 있다.

분석가가 끝나면 message clear node를 거쳐 다음 분석가로 간다. 보고서는 state에 남지만
tool call 대화가 다음 분석가의 `messages`에 무한히 누적되지 않는다.

## 핵심 정리

- 역할의 차이는 이름보다 데이터 도구와 report field에서 생긴다.
- Market Analyst는 정확한 수치 주장을 verified snapshot에 고정한다.
- Sentiment Analyst는 소셜 데이터를 미리 수집해 prompt와 evidence의 불일치를 줄였다.
- 선택 데이터 실패와 핵심 데이터 실패는 서로 다르게 처리한다.
- tool을 호출하는 중간 message와 최종 report는 별도 상태다.

## 원본 소스

- [`Market Analyst`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/market_analyst.py)
- [`Sentiment Analyst`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/sentiment_analyst.py)
- [`News Analyst`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/news_analyst.py)
- [`Fundamentals Analyst`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/fundamentals_analyst.py)
- [`ToolNode 구성`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py)
