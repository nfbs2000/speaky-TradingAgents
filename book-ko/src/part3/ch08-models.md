# 8장: 모델 공급자와 구조화 출력

## provider abstraction은 모델을 같게 만들지 않는다

TradingAgents는 OpenAI, Anthropic, Google, Azure, Bedrock과 여러 OpenAI-compatible
endpoint를 지원한다. 공통 factory가 같은 `BaseLLMClient` 계약을 돌려주지만, reasoning
설정, structured output와 인증 방식까지 같아지는 것은 아니다.

<div class="mermaid">
flowchart TD
    F["create_llm_client"] --> A["Anthropic native"]
    F --> G["Google native"]
    F --> Z["Azure OpenAI"]
    F --> B["AWS Bedrock"]
    F --> O["OpenAI-compatible registry"]
    O --> P["OpenAI·xAI·DeepSeek·Qwen·GLM·MiniMax·OpenRouter·Ollama 등"]
</div>

factory는 provider module을 lazy import한다. test collection이나 단순 import 때 모든 무거운
SDK를 불러오고 API key를 요구하지 않기 위한 선택이다.

## quick model과 deep model

기본 config는 두 model ID를 갖는다.

| 모델 슬롯 | 기본 역할 |
|---|---|
| quick | analyst, bull/bear, trader, risk analyst, reflection |
| deep | research manager, portfolio manager |

사용자는 provider와 두 model을 바꿀 수 있다. 같은 역할을 더 큰 모델로 바꾼다고 데이터
근거가 늘어나는 것은 아니다. tool과 prompt 경계는 graph 코드가 결정한다.

## provider별 사고 설정

생성자는 provider에 따라 다른 설정을 전달한다.

- Google: `thinking_level`
- OpenAI: `reasoning_effort`
- Anthropic: `effort`
- 공통: `temperature`, 명시한 `llm_max_retries`

`temperature=None`이면 provider 기본값을 유지한다. reasoning-first 모델은 temperature를
무시할 수 있어 0으로 설정해도 byte-identical 결과를 보장하지 않는다.

## 모델 카탈로그의 역할

`model_catalog.py`는 CLI 표시와 model validation이 공유하는 목록이다. 자주 바뀌는 hosted
provider와 OpenAI-compatible server는 오래된 목록을 박제하지 않고 `Custom model ID`만
제공하기도 한다.

이 카탈로그는 “이 모델이 실제 계정에서 사용 가능하다”는 원격 readiness 증명이 아니다.
CLI 선택 후보와 알려진 ID의 로컬 계약이다. endpoint 권한, 계정 entitlement와 모델 폐기는
실제 호출에서 드러난다.

## 구조화 출력과 free-text fallback

Sentiment Analyst, Research Manager, Trader, Portfolio Manager는 Pydantic schema를
`with_structured_output()`에 연결한다.

<div class="mermaid">
flowchart LR
    P["prompt"] --> S{"structured binding 있음?"}
    S -- "yes" --> I["schema invocation"]
    I --> V{"parsed result?"}
    V -- "yes" --> M["Markdown render"]
    V -- "no·exception" --> W["warning"]
    S -- "no" --> W
    W --> F["plain LLM invoke 1회"]
    F --> T["free-text Markdown"]
</div>

fallback의 장점은 약한 local model이나 일시적인 JSON 오류 때문에 전체 graph가 멈추는 일을
줄이는 것이다. 단점은 consumer가 typed field를 받았다고 확신할 수 없다는 점이다. 소스는
fallback 때 warning을 남겨 이 차이를 숨기지 않는다.

## 관리 node가 tool을 쓰지 않는 이유

`NO_EXTERNAL_TOOLS`는 “prompt에 제공된 근거만 사용하고, 없으면 없다고 말하라”고 요구한다.
Research Manager, Trader, Portfolio Manager가 새 검색을 시작하면 analyst report와 최종
결론 사이의 evidence chain이 흐려진다.

이 제한은 모든 agent에 적용되지 않는다. analyst는 자신의 tool을 써야 한다. 역할별로
tool 권한이 다른 것이 핵심이다.

## 여러 provider가 같은 결과를 내는가

아니다. schema와 state shape가 같아도 모델은 다음에서 달라질 수 있다.

- tool 선택과 호출 순서
- 긴 보고서에서 중요하다고 고르는 근거
- 반론의 강도와 rating
- 구조화 출력 지원 방식
- reasoning 비용과 latency
- retry와 error shape

따라서 provider adapter는 호출 표면을 공통화하지만 판단 의미를 표준화하지 않는다.

## 핵심 정리

- LLM factory는 provider별 client 생성을 공통 진입점으로 묶는다.
- quick/deep 모델은 비용과 판단 역할을 나누는 설정이다.
- provider별 reasoning knob는 공통 이름으로 억지 통합되지 않는다.
- 구조화 출력 실패는 warning 후 free-text로 낮아진다.
- 모델 카탈로그는 원격 사용 가능성이나 동일한 행동을 보증하지 않는다.

## 원본 소스

- [`LLM factory`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/llm_clients/factory.py)
- [`model catalog`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/llm_clients/model_catalog.py)
- [`structured output helper`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/structured.py)
- [`provider config 전달`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py)
