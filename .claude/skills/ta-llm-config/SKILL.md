---
name: ta-llm-config
description: 사용자가 "change LLM provider", "switch to Claude", "use Gemini", "configure Ollama", "change model", "switch from GPT to Claude", "set up local model", "add new LLM provider", "change deep thinking model", "configure API key", "tune model parameters", "set reasoning effort", "set thinking level", "use Azure OpenAI", "use Bedrock", "vLLM", "LM Studio"를 요청하거나 TradingAgents의 LLM/모델 설정을 언급할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents LLM 설정

LLM 프로바이더, 모델, 추론 파라미터를 설정한다.

## 설정

LLM 설정은 `tradingagents/default_config.py`에 있다. 모든 항목에
`TRADINGAGENTS_*` 환경변수 오버라이드가 있으므로 **프로바이더를 바꾸는 데 코드 수정이 필요 없다**:

```python
"llm_provider":             "openai",       # TRADINGAGENTS_LLM_PROVIDER
"deep_think_llm":           "gpt-5.5",      # TRADINGAGENTS_DEEP_THINK_LLM
"quick_think_llm":          "gpt-5.4-mini", # TRADINGAGENTS_QUICK_THINK_LLM
"backend_url":              None,           # TRADINGAGENTS_LLM_BACKEND_URL
"google_thinking_level":    None,           # TRADINGAGENTS_GOOGLE_THINKING_LEVEL
"openai_reasoning_effort":  None,           # TRADINGAGENTS_OPENAI_REASONING_EFFORT
"anthropic_effort":         None,           # TRADINGAGENTS_ANTHROPIC_EFFORT
"temperature":              None,           # TRADINGAGENTS_TEMPERATURE
"llm_max_retries":          None,           # TRADINGAGENTS_LLM_MAX_RETRIES
```

오버라이드는 `default_config.py`의 `_ENV_OVERRIDES` 테이블 한 곳에 선언되어 있다.
**새 설정 키를 환경변수 오버라이드 대상으로 노출하려면 거기에 한 줄만 추가하면 된다.**
값은 기존 기본값의 타입으로 강제 변환되며, 잘못된 값(bool 자리에 `treu`, 숫자가 아닌 int)은
무인 실행이 조용히 잘못 설정되는 대신 import 시점에 `ValueError`를 발생시킨다.

`backend_url`의 기본값은 OpenAI URL이 아니라 **`None`**이다. 각 클라이언트가 자신의
프로바이더 기본값으로 폴백한다. 예전에는 특정 프로바이더의 URL이 전역 기본값으로
새어 나갔다(OpenAI의 `/v1`이 Gemini로 전달되어 잘못된 URL이 만들어졌다).

## 지원 프로바이더

### 네이티브 클라이언트 (실제로 API가 다른 경우)

| 프로바이더 | 설정 값 | 클라이언트 | API 키 환경변수 |
|---|---|---|---|
| Anthropic | `anthropic` | `AnthropicClient` | `ANTHROPIC_API_KEY` |
| Google | `google` | `GoogleClient` | `GOOGLE_API_KEY` |
| Azure OpenAI | `azure` | `AzureOpenAIClient` | `AZURE_OPENAI_API_KEY` |
| Amazon Bedrock | `bedrock` | `BedrockClient` | 없음 — AWS 자격증명 체인 |

### OpenAI 호환 계열 (각각 레지스트리 한 줄)

| 프로바이더 | 설정 값 | 기본 base URL | API 키 환경변수 |
|---|---|---|---|
| OpenAI | `openai` | SDK 기본값 (Responses API) | `OPENAI_API_KEY` |
| xAI | `xai` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| DeepSeek | `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| Qwen (국제) | `qwen` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Qwen (중국) | `qwen-cn` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_CN_API_KEY` |
| GLM / Z.AI | `glm` | `https://api.z.ai/api/paas/v4/` | `ZHIPU_API_KEY` |
| GLM (중국) | `glm-cn` | `https://open.bigmodel.cn/api/paas/v4/` | `ZHIPU_CN_API_KEY` |
| MiniMax | `minimax` | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` |
| MiniMax (중국) | `minimax-cn` | `https://api.minimaxi.com/v1` | `MINIMAX_CN_API_KEY` |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| Mistral | `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| Kimi / Moonshot | `kimi` | `https://api.moonshot.ai/v1` | `MOONSHOT_API_KEY` |
| Groq | `groq` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| NVIDIA NIM | `nvidia` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| Ollama | `ollama` | `http://localhost:11434/v1` (또는 `OLLAMA_BASE_URL`) | 없음 |
| 범용 엔드포인트 | `openai_compatible` | `backend_url`에서 **필수** | `OPENAI_COMPATIBLE_API_KEY` (선택) |

이중 리전 프로바이더가 키를 따로 두는 것은 의도된 것이다. 국제 계정과 중국 계정은
서로 호환되지 않는다(upstream #758).

vLLM, LM Studio, llama.cpp 또는 임의의 릴레이에는 `openai_compatible`을 쓴다.
`backend_url`을 예컨대 `http://localhost:8000/v1`로 설정한다. 생략하면 해결 방법을
명시한 `ValueError`가 발생한다.

## 2-LLM 구조

- **`quick_think_llm`** — 애널리스트 4명, Bull, Bear, Trader, 리스크 토론자 3명, Reflector
- **`deep_think_llm`** — Research Manager, Portfolio Manager (최종 의사결정)

두 클라이언트 모두 **같은 프로바이더**로 `TradingAgentsGraph.__init__`에서 생성된다.
에이전트별로 프로바이더를 섞을 수는 없다.

## 프로바이더 전환

권장 방식 — `.env`, 코드 수정 없음:

```bash
TRADINGAGENTS_LLM_PROVIDER=anthropic
TRADINGAGENTS_DEEP_THINK_LLM=claude-fable-5
TRADINGAGENTS_QUICK_THINK_LLM=claude-haiku-4-5
TRADINGAGENTS_ANTHROPIC_EFFORT=high
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
# Google
TRADINGAGENTS_LLM_PROVIDER=google
TRADINGAGENTS_DEEP_THINK_LLM=gemini-3.1-pro-preview
TRADINGAGENTS_QUICK_THINK_LLM=gemini-3.5-flash
TRADINGAGENTS_GOOGLE_THINKING_LEVEL=high
```

```bash
# 로컬 Ollama
TRADINGAGENTS_LLM_PROVIDER=ollama
TRADINGAGENTS_DEEP_THINK_LLM=glm-4.7-flash:latest
TRADINGAGENTS_QUICK_THINK_LLM=qwen3:latest
OLLAMA_BASE_URL=http://localhost:11434/v1     # 선택 사항. 원격 호스트도 동작한다
```

```bash
# 임의의 OpenAI 호환 서버 (vLLM / LM Studio)
TRADINGAGENTS_LLM_PROVIDER=openai_compatible
TRADINGAGENTS_LLM_BACKEND_URL=http://localhost:8000/v1
TRADINGAGENTS_DEEP_THINK_LLM=my-served-model
TRADINGAGENTS_QUICK_THINK_LLM=my-served-model
```

또는 코드에서:

```python
config = {**DEFAULT_CONFIG, "llm_provider": "anthropic",
          "deep_think_llm": "claude-fable-5", "quick_think_llm": "claude-haiku-4-5"}
graph = TradingAgentsGraph(config=config)
```

대화형 CLI(`tradingagents analyze`)는 프로바이더, 모델, 빠진 API 키를 물어보며,
해당 환경변수가 이미 설정되어 있으면 reasoning/thinking 대화형 프롬프트를 건너뛴다.

## 팩토리 구조

`llm_clients/factory.py::create_llm_client(provider, model, base_url=None, **kwargs)`
→ `BaseLLMClient`. 프로바이더 모듈은 **지연 임포트**되므로 팩토리를 임포트해도
무거운 SDK가 딸려 오거나 키가 없다고 실패하지 않는다.

디스패치 순서 — 네이티브 API 먼저(문자열 검사 단계에서 OpenAI 클라이언트를 임포트하지
않도록), 그다음 레지스트리:

```python
anthropic → AnthropicClient
google    → GoogleClient
azure     → AzureOpenAIClient
bedrock   → BedrockClient
is_openai_compatible(p) → OpenAIClient(model, base_url, provider=p)
else      → ValueError(f"Unsupported LLM provider: {provider}")
```

모든 클라이언트는 `get_llm()`(LangChain 채팅 모델 반환)과 `validate_model()`을 구현한다.
`BaseLLMClient.warn_if_unknown_model()`은 차단하지 않고 `RuntimeWarning`
("Continuing anyway")만 낸다. 알 수 없는 모델은 오류가 아니라 경고다.

`base_client.normalize_content(response)`는 타입 블록 리스트 형태의 콘텐츠
(OpenAI Responses API, Gemini 3, Anthropic 확장 사고)를 평범한 문자열로 평탄화한다.
하위 에이전트들이 `response.content`를 `str`로 가정하기 때문이다. 각 프로바이더
클라이언트에는 `invoke()`에서 이를 적용하는 `Normalized*` 서브클래스가 있다.

## 프로바이더 레지스트리

`llm_clients/openai_client.py::OPENAI_COMPATIBLE_PROVIDERS: dict[str, ProviderSpec]`가
OpenAI 호환 계열의 단일 진실 공급원이다. 예전에는 base URL 딕셔너리에 프로바이더별
인증 분기와 클라이언트 클래스 분기가 따로 있었지만, 이제 한 줄로 대체된다:

```python
@dataclass(frozen=True)
class ProviderSpec:
    chat_class: type = NormalizedChatOpenAI   # 프로바이더별 와이어 포맷 특이사항
    base_url: str | None = None               # 기본 엔드포인트 (None → SDK 기본값)
    base_url_env: str | None = None           # 환경변수 오버라이드, 예: OLLAMA_BASE_URL
    key_optional: bool = False                # 키를 요구하거나 묻지 않음
    placeholder_key: str = "EMPTY"            # 키가 없을 때 전송할 값
    require_base_url: bool = False            # 해결되지 않으면 오류
    use_responses_api: bool = False           # 네이티브 OpenAI Responses API
```

`base_url` 우선순위: 명시적 클라이언트 `base_url`(즉 config /
`TRADINGAGENTS_LLM_BACKEND_URL`) → `spec.base_url_env` → `spec.base_url` → SDK 기본값.

Responses API는 `spec.use_responses_api`이면서 **동시에**
`_is_native_openai_base_url(base_url)`일 때만 활성화된다. `openai` 프로바이더를
프록시나 로컬 서버로 향하게 하면 Chat Completions를 유지하는데, `/v1/responses`는
네이티브 OpenAI에만 존재하기 때문이다(upstream #1024).

API 키 환경변수 이름은 별도로 `llm_clients/api_key_env.py::PROVIDER_API_KEY_ENV`에 있으며,
클라이언트와 CLI의 키 입력 프롬프트가 모두 이 한 곳을 읽는다. 레지스트리에는
*동작상의* 차이만 둔다.

## 프로바이더별 파라미터

### OpenAI
- `openai_reasoning_effort`: `"low" | "medium" | "high"`
- `_OPENAI_REASONING_MODEL = re.compile(r"^(gpt-5|o[1-9])")`가 이를 제어한다.
  추론 모델이 아니면 `reasoning_effort`는 조용히 제거된다.

### Anthropic
- `anthropic_effort`: `"low" | "medium" | "high"` → `effort`로 전달
- `_supports_effort(model)`가 계열별 최소 버전으로 제어한다: **Opus ≥ 4.5, Sonnet ≥ 4.6,
  Fable ≥ 5.0**. Sonnet 4.5와 **모든 Haiku**는 HTTP 400
  `"This model does not support the effort parameter"`를 반환하므로(upstream #831),
  이들에게는 kwarg를 전달하지 않고 제거한다. 프리뷰 이름 두 개는 명시적으로 허용한다:
  `claude-mythos-preview`, `claude-mythos-5`.
- 통과 kwargs: `timeout`, `max_retries`, `api_key`, `max_tokens`,
  `temperature`, `callbacks`, `http_client`, `http_async_client`, `effort`.

### Google
- `google_thinking_level`: **문자열**(`"high"`, `"low"`, `"minimal"`, …).
  Gemini 3.x는 `thinking_level`을 받는다. 정수형 `thinking_budget`은 단종된 2.5
  라인용이었고 지금은 없다.
- Pro 모델은 `"minimal"`을 거부하므로 자동으로 `"low"`로 바꾼다.

### Azure
`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_VERSION`
(예: `2025-03-01-preview`)이 필요하고, 선택적으로 `AZURE_OPENAI_DEPLOYMENT_NAME`
(기본값은 모델 이름)을 쓴다.

### Bedrock
선택적 설치: `pip install "tradingagents[bedrock]"` (`langchain-aws`를 가져온다).
AWS 자격증명 체인으로 인증하므로 키 환경변수가 없다. 리전 해석은
`us-west-2`로 폴백한다(Bedrock에는 전역 기본값이 없고, us-west-2가 가장 넓은
모델 집합을 제공한다). 모델 이름은 Bedrock 모델 ID 또는 교차 리전 추론
프로파일 ID다. 예: `us.anthropic.claude-opus-4-8-v1:0`.

### DeepSeek / MiniMax 특이사항
`llm_clients/capabilities.py`에서 선언적으로 처리한다 — 아래 참조.

### 프로바이더 공통
- `temperature`: 설정하면 모든 프로바이더로 전달된다. 추론 모델은 대체로 이를
  무시하며, 어떤 설정으로도 실행 간 출력이 비트 단위로 동일해지지는 않는다.
- `llm_max_retries`: SDK 재시도 예산으로 모든 프로바이더 채팅 클라이언트에 전달된다.
  `None`이면 각 SDK의 기본값(보통 2)을 유지한다. 갑작스러운 429 스로틀링에
  실행을 중단하는 대신 버티려면 값을 올린다(upstream #1091). `_coerce_max_retries`가
  검증하며 bool과 음수는 명시적으로 거부한다.

## 능력(capability) 테이블

`llm_clients/capabilities.py`는 어떤 모델 ID가 어떤 파라미터를 거부하는지 아는
유일한 곳이다. 클라이언트 서브클래스는 모델 이름 `if` 사다리를 하드코딩하는 대신
`get_capabilities(model_name)`을 호출한다:

```python
@dataclass(frozen=True)
class ModelCapabilities:
    supports_tool_choice: bool
    supports_json_mode: bool
    supports_json_schema: bool
    preferred_structured_method: StructuredMethod   # function_calling | json_mode | json_schema | none
    requires_reasoning_content_roundtrip: bool = False   # DeepSeek thinking models
    requires_reasoning_split: bool = False               # MiniMax M2.x
```

해석 순서: `_BY_ID`의 정확한 ID, 그다음 `_BY_PATTERN`의 정규식
(`^deepseek-v\d`, `^deepseek-reasoner`, `^MiniMax-M\d`), 그다음 `_DEFAULT`.

이 프로젝트에서 중요한 이유: 구조화 출력 에이전트 4개가
`with_structured_output()`을 호출한다. DeepSeek thinking 모델은 `tools`는 받지만
**`tool_choice`에서 400을 낸다**. MiniMax M2.x는 `tool_choice`를 `{"none","auto"}`로
제한하는데 LangChain은 함수 명세 딕셔너리를 보낸다. `supports_tool_choice=False`면
`NormalizedChatOpenAI`가 해당 kwarg를 억제해서 스키마는 여전히 도구로 전달된다.

**특이사항이 있는 새 모델을 추가한다는 것은 클라이언트 코드가 아니라 이 테이블을 고치는 것이다.**

## 새 프로바이더 추가

### OpenAI Chat Completions API를 쓴다면 (대부분의 경우) — 새 클라이언트 불필요

1. `openai_client.py`의 `OPENAI_COMPATIBLE_PROVIDERS`에 한 줄 추가한다.
2. `api_key_env.py`의 `PROVIDER_API_KEY_ENV`에 키 환경변수를 추가한다(또는 `None`).
3. `model_catalog.py`에 `MODEL_OPTIONS` 항목을 추가한다. 모델이 많거나 자주 바뀌는
   프로바이더라면 `_CUSTOM_ONLY`를 쓴다.
4. 모델 이름을 사용자가 정하는 방식이면 `validators.py`의 `_ANY_MODEL_PROVIDERS`에
   프로바이더를 추가해서 `warn_if_unknown_model`이 조용하도록 한다.
5. 와이어 포맷 특이사항이 있으면 `NormalizedChatOpenAI`를 상속하고 `chat_class`를
   설정한다. 모델별 파라미터 특이사항은 `capabilities.py`에 선언한다.

### API가 실제로 다르다면

1. `BaseLLMClient`를 상속하는 `llm_clients/{provider}_client.py`를 만들고
   `get_llm()`과 `validate_model()`을 구현한다. `invoke()`가 `normalize_content`를
   호출하도록 채팅 클래스를 감싼다.
2. `factory.py`에서 레지스트리 검사 **위쪽**에 지연 임포트 분기를 추가한다.
3. 위와 같이 `api_key_env.py`, `model_catalog.py`, `validators.py`에 등록한다.
4. thinking/effort 노브를 받는다면 `graph/trading_graph.py`에
   `_get_provider_kwargs()` 분기를 추가하고 설정 키와 `_ENV_OVERRIDES` 행도 넣는다.

## 모델 카탈로그와 검증

`model_catalog.py::MODEL_OPTIONS[provider]["quick" | "deep"]`은
`(label, model_id)` 쌍의 리스트다. CLI 드롭다운과
`validators.py::VALID_MODELS`(`get_known_models()`로 생성) **양쪽**을 구동하므로
카탈로그와 검증기가 어긋날 수 없다.

`_ANY_MODEL_PROVIDERS`(검증을 완전히 건너뜀): `ollama`, `openrouter`,
`openai_compatible`, `mistral`, `kimi`, `groq`, `nvidia`, `bedrock`.

모델 추가 = `MODEL_OPTIONS`에 항목 하나. `_CUSTOM_ONLY`는 목록이 금방 낡는
프로바이더용 공용 "Custom model ID only" 자리표시자다.

## 검증

```bash
python3 -c "
from tradingagents.llm_clients.openai_client import OPENAI_COMPATIBLE_PROVIDERS
from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS
native = {'anthropic', 'google', 'azure', 'bedrock'}
compat = set(OPENAI_COMPATIBLE_PROVIDERS)
print(len(compat), 'openai-compatible +', len(native), 'native')
missing_key = (compat | native) - set(PROVIDER_API_KEY_ENV)
missing_cat = (compat | native) - set(MODEL_OPTIONS)
print('missing from api_key_env:', missing_key or 'none')
print('missing from model_catalog:', missing_cat or 'none')
"
pytest tests/test_provider_registry.py tests/test_model_validation.py \
       tests/test_capabilities.py tests/test_api_key_env.py \
       tests/test_env_overrides.py tests/test_temperature_config.py \
       tests/test_llm_max_retries.py -q
```

기대 출력: `16 openai-compatible + 4 native`, `api_key_env`에서 누락 없음,
`model_catalog`에서 `{'openrouter', 'azure'}` 누락. 이 두 개의 부재는 의도된 것으로,
OpenRouter의 모델 목록은 동적으로 가져오고 Azure 배포 이름은 무엇이든 유효하기
때문이다. 그래서 `get_model_options()`는 설계상 이 둘에 대해 `KeyError`를 낸다.
`bedrock`은 카탈로그에 **있으며** `_CUSTOM_ONLY`에 매핑된다.

실제 스모크 테스트에는 진짜 키가 필요하다:
```bash
python3 -c "
from tradingagents.llm_clients import create_llm_client
llm = create_llm_client('openai', 'gpt-5.4-mini').get_llm()
print(llm.invoke('reply with OK').content)
"
```

## 추가 자료

- **`references/providers.md`** — 클라이언트별 내부 구조, 정규화 래퍼,
  능력 테이블 행, `TradingAgentsGraph`가 프로바이더 kwargs를 만드는 방식
