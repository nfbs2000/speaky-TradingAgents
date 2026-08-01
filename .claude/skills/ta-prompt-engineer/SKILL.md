---
name: ta-prompt-engineer
description: 사용자가 "modify agent prompt", "improve prompt", "change system message", "tune agent behavior", "A/B test prompts", "edit market analyst prompt", "change news analyst instructions", "modify bull researcher tone", "adjust portfolio manager criteria", "update trader prompt", "change sentiment analyst prompt"를 요청하거나 TradingAgents의 12개 에이전트 중 하나에 대한 프롬프트 엔지니어링을 언급할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents 프롬프트 엔지니어링

TradingAgents 멀티 에이전트 트레이딩 시스템의 12개 LLM 에이전트 프롬프트를 수정하고,
개선하고, A/B 테스트한다.

## 에이전트 빠른 참조

| 에이전트 | 파일 | LLM | 프롬프트 방식 | 구조화 출력 |
|-------|------|-----|--------------|-------------------|
| Market Analyst | `agents/analysts/market_analyst.py` | quick | ChatPromptTemplate + `system_message` 변수 | 아니오 (산문) |
| News Analyst | `agents/analysts/news_analyst.py` | quick | ChatPromptTemplate + `system_message` 변수 | 아니오 (산문) |
| Fundamentals Analyst | `agents/analysts/fundamentals_analyst.py` | quick | ChatPromptTemplate + `system_message` 변수 | 아니오 (산문) |
| Sentiment Analyst | `agents/analysts/sentiment_analyst.py` | quick | ChatPromptTemplate + `_build_system_message()` | **예** — `SentimentReport` |
| Bull Researcher | `agents/researchers/bull_researcher.py` | quick | f-string 프롬프트 | 아니오 |
| Bear Researcher | `agents/researchers/bear_researcher.py` | quick | f-string 프롬프트 | 아니오 |
| Research Manager | `agents/managers/research_manager.py` | **deep** | f-string 프롬프트 | **예** — `ResearchPlan` |
| Trader | `agents/trader/trader.py` | quick | `messages` 리스트 (system + user dict) | **예** — `TraderProposal` |
| Aggressive Debator | `agents/risk_mgmt/aggressive_debator.py` | quick | f-string 프롬프트 | 아니오 |
| Conservative Debator | `agents/risk_mgmt/conservative_debator.py` | quick | f-string 프롬프트 | 아니오 |
| Neutral Debator | `agents/risk_mgmt/neutral_debator.py` | quick | f-string 프롬프트 | 아니오 |
| Portfolio Manager | `agents/managers/portfolio_manager.py` | **deep** | f-string 프롬프트 | **예** — `PortfolioDecision` |

여기에 노드가 아닌 프롬프트 소유자가 하나 더 있다:

| Reflector | `graph/reflection.py` | quick | `_get_log_reflection_prompt()`가 시스템 프롬프트를 반환 | 아니오 |

모든 경로는 `tradingagents/` 기준 상대 경로다.

> **명칭 주의**: 리스크 판정자는 "Risk Manager"가 아니라 **Portfolio Manager**다.
> 네 번째 애널리스트는 **Sentiment Analyst**다 (v0.2.5에서 `social_media_analyst`에서
> 이름이 바뀜). `create_social_media_analyst`는 `DeprecationWarning`을 내는 폐기 예정
> 별칭으로만 남아 있다. 그래프 배선 키는 여전히 `"social"`이다.

## 프롬프트 아키텍처 패턴

### 패턴 A: 도구를 사용하는 애널리스트 (market, news, fundamentals)

2계층 구조:

1. **바깥쪽 시스템 메시지** (`ChatPromptTemplate`): `{tool_names}`, `{system_message}`,
   `{current_date}`, `{instrument_context}`를 담은 범용 협업 래퍼
2. **안쪽 `system_message` 변수**: 도메인 지시문 — 실제로 수정할 주 프롬프트

```python
system_message = (
    """You are a trading assistant tasked with analyzing ..."""
    + get_language_instruction()          # ← 이 접미사는 항상 유지한다
)

prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a helpful AI assistant, collaborating with other assistants."
     ...
     " You have access to the following tools: {tool_names}."
     " Today's date is {current_date}; treat it as 'now' for all analysis and"
     " tool-call date ranges. {instrument_context}\n"
     "{system_message}"),
    MessagesPlaceholder(variable_name="messages"),
])
prompt = prompt.partial(system_message=system_message)
prompt = prompt.partial(tool_names=", ".join([t.name for t in tools]))
prompt = prompt.partial(current_date=current_date)
prompt = prompt.partial(instrument_context=instrument_context)
chain = prompt | llm.bind_tools(tools)
```

`create_*` 함수 안의 `system_message` 문자열을 수정한다. 협업 프로토콜 자체를 바꾸는
경우가 아니라면 바깥쪽 템플릿은 건드리지 않는다.

### 패턴 B: Sentiment Analyst (사전 fetch + 구조화 출력, 도구 루프 없음)

Sentiment Analyst는 **도구 호출을 사용하지 않는다**. LLM 실행 전에 세 개의 소스를
미리 가져와 프롬프트 블록으로 주입한다:

```python
news_block       = get_news.func(ticker, start_date, end_date)   # .func 는 @tool 을 우회한다
stocktwits_block = fetch_stocktwits_messages(ticker, limit=30)
reddit_block     = fetch_reddit_posts(ticker)

system_message = _build_system_message(ticker=..., news_block=..., ...)
formatted_messages = prompt.format_messages(messages=state["messages"])
report_text = invoke_structured_or_freetext(
    structured_llm, llm, formatted_messages, render_sentiment_report, "Sentiment Analyst",
)
```

프롬프트는 모듈 수준 헬퍼 `_build_system_message()`가 만든다. 분석 모범 사례 목록과
출력 필드 설명이 여기에 있다. 바깥쪽 래퍼는 `NO_EXTERNAL_TOOLS`를 포함시켜 모델이
도구 호출을 지어내지 않게 한다 (스키마 전용 구조화 출력은 정확히 하나의 도구를 바인딩한다).

### 패턴 C: 순수 대화 에이전트 (bull, bear, 3개 debator)

메모리 인자 없이 f-string 프롬프트를 직접 쓴다:

```python
prompt = f"""You are a Bull Analyst advocating for investing in the {target_label}.
...
Resources available:
{instrument_context}
Market research report: {market_research_report}
...
""" + get_language_instruction()

response = llm.invoke(prompt)
```

`target_label` / `fundamentals_label`은 `asset_type == "crypto"`일 때 표현을 맞춰준다.

### 패턴 D: 구조화 의사결정 에이전트 (Research Manager, Trader, Portfolio Manager)

**생성** 시점에 Pydantic 스키마를 바인딩하고, **실행** 시점에 공용 헬퍼를 통해 호출한다:

```python
def create_portfolio_manager(llm):
    structured_llm = bind_structured(llm, PortfolioDecision, "Portfolio Manager")

    def portfolio_manager_node(state) -> dict:
        prompt = f"""As the Portfolio Manager, ..."""
        final_trade_decision = invoke_structured_or_freetext(
            structured_llm, llm, prompt, render_pm_decision, "Portfolio Manager",
        )
```

**`agents/schemas.py`의 스키마 필드 설명은 프롬프트 텍스트다.** 그것이 모델의 출력
지시문 역할을 한다. 출력 형태나 필드별 가이드를 바꾸려면 프롬프트 본문이 아니라 그곳의
`Field(description=...)` 문자열을 수정한다. 프롬프트 본문은 컨텍스트와 등급 척도
가이드만 담는다.

### 패턴 E: Reflector (클래스 기반)

`Reflector._get_log_reflection_prompt()`는 `reflect_on_final_decision()`이 사용하는
시스템 프롬프트를 반환한다. 출력은 메모리 로그에 그대로 저장되어 이후 실행에서 다시
읽히므로, 프롬프트가 평문 산문 2~4문장으로 상한을 강제한다.

## 프롬프트 수정 워크플로

1. 대상 에이전트 파일을 **읽는다**.
2. 프롬프트를 **찾는다**: `system_message` (애널리스트), `prompt` f-string (대화형
   에이전트), `_build_system_message()` (sentiment), 또는 출력 형태의 경우
   `agents/schemas.py`의 `Field(description=...)`.
3. 필수 템플릿 변수를 유지한 채 변경안을 **작성한다**.
4. Edit으로 **적용한다**.
5. **검증한다** — 아래 검증 절 참고.

## 핵심 제약

- 출력이 저장 리포트까지 도달하는 모든 프롬프트에는 **`+ get_language_instruction()`을
  유지한다**. 이를 빼면 비영어 실행(`output_language` 설정)이 깨진다.
- **애널리스트는 바깥쪽 템플릿에 `{tool_names}`, `{current_date}`,
  `{instrument_context}`를 유지해야 한다**. **`{ticker}` 변수는 없다** — 티커 식별
  정보는 `instrument_context`를 통해 전달되며, 실행마다 한 번
  `resolve_instrument_identity()`가 해석한다 (결정적 yfinance 조회, 캐시됨, fail-open).
  덕분에 에이전트가 가격 차트만 보고 기업을 환각하지 못한다.
- **리서처/debator는 f-string 보간으로 리포트 변수를 받는다** —
  `{market_research_report}`, `{sentiment_report}`, `{news_report}`,
  `{fundamentals_report}`를 제거하지 않는다.
- **Portfolio Manager는 state에서 `{past_context}`를 읽는다** (메모리 로그 교훈,
  실행 시작 시 주입됨). 이를 감싸는 조건 블록을 유지한다 — 메모리 컨텍스트를 받는
  에이전트는 이것뿐이다.
- **5단계 등급 어휘는 고정이다**: Buy / Overweight / Hold / Underweight /
  Sell (`agents/utils/rating.py::RATINGS_5_TIER`). Research Manager와
  Portfolio Manager는 이 중 하나를 출력해야 한다. `SignalProcessor.process_signal()`은
  렌더링된 `**Rating**: X` 헤더를 정규식으로 파싱한다 — LLM 호출은 없다. 어휘를 바꾸려면
  `rating.py`, `schemas.py::PortfolioRating`, `tests/test_signal_processing.py`를 함께
  수정해야 한다.
- **Trader의 3단계 액션**은 Buy / Hold / Sell이다 (`schemas.py::TraderAction`).
  `render_trader_proposal()`은 하위 호환을 위해
  `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**`을 덧붙인다 — 그대로 유지한다.
- **구조화 에이전트는 단일 도구 바인딩 아래서 실행된다.** 구조화 에이전트의 프롬프트에
  "웹을 검색하라" 같은 지시를 추가하면 모델이 알 수 없는 도구 호출을 내보내고, 구조화
  시도는 폐기되며, 조용히 자유 텍스트로 저하된다. `NO_EXTERNAL_TOOLS` 문구가 있는 곳은
  유지한다.
- **`render_*`의 마크다운 헤더는 계약이다.** `**Rating**`, `**Executive
  Summary**`, `**Investment Thesis**`, `**Overall Sentiment:**`는 `reporting.py`,
  CLI 표시, 메모리 로그가 소비한다.

## 자주 하는 수정

- **분석 깊이 변경** → `system_message` (애널리스트) 또는 프롬프트 본문 (대화형 에이전트)
- **출력 형식 조정** → 구조화 에이전트는 `schemas.py`의 `Field(description=...)`,
  산문형 애널리스트는 `system_message` 안의 마크다운 표 지시문
- **의사결정 기준 튜닝** → 매니저 프롬프트의 등급 척도 가이드
- **토론 스타일 변경** → 리서처/debator 프롬프트의 참여도·어조 관련 문장
- **감성 점수 구간 변경** → `schemas.py`의 `SentimentBand` + `overall_score` 설명,
  그리고 `_build_system_message()`의 대응 가이드

## 검증

```bash
python3 -c "from tradingagents.graph.trading_graph import TradingAgentsGraph"
pytest tests/test_structured_agent_prompts.py tests/test_structured_agents.py \
       tests/test_news_analyst_prompt.py tests/test_i18n_coverage.py -q
```

에이전트 프롬프트에서 `get_language_instruction()`이 빠지면
`tests/test_i18n_coverage.py`가 실패한다. `tests/test_structured_agent_prompts.py`는
스키마 전용 에이전트의 no-external-tools 문구를 지킨다.

## 추가 자료

- **`references/agent_map.md`** — 팩토리, state 입출력, 도구, 스키마 바인딩을 포함한
  12개 에이전트 전체 지도
