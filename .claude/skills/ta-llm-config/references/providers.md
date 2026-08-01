# LLM 프로바이더 클라이언트 상세

## 클라이언트 파일

| 파일 | 내용 | 대상 |
|------|----------|--------|
| `llm_clients/base_client.py` | `BaseLLMClient`, `normalize_content()` | 전체 |
| `llm_clients/factory.py` | `create_llm_client()` | 진입점 |
| `llm_clients/openai_client.py` | `ProviderSpec`, `OPENAI_COMPATIBLE_PROVIDERS`, `OpenAIClient`, `NormalizedChatOpenAI`, `DeepSeekChatOpenAI`, `MinimaxChatOpenAI`, `LocalCompatibleChatOpenAI`, `is_openai_compatible()` | 프로바이더 16개 |
| `llm_clients/anthropic_client.py` | `AnthropicClient`, `NormalizedChatAnthropic`, `_supports_effort()` | Anthropic |
| `llm_clients/google_client.py` | `GoogleClient`, `NormalizedChatGoogleGenerativeAI` | Google |
| `llm_clients/azure_client.py` | `AzureOpenAIClient`, `NormalizedAzureChatOpenAI` | Azure OpenAI |
| `llm_clients/bedrock_client.py` | `BedrockClient`, `_bedrock_class()` | Amazon Bedrock |
| `llm_clients/api_key_env.py` | `PROVIDER_API_KEY_ENV`, `get_api_key_env()` | 전체 + CLI |
| `llm_clients/model_catalog.py` | `MODEL_OPTIONS`, `get_model_options()`, `get_known_models()` | CLI + 검증기 |
| `llm_clients/validators.py` | `VALID_MODELS`, `validate_model()`, `_ANY_MODEL_PROVIDERS` | 전체 |
| `llm_clients/capabilities.py` | `ModelCapabilities`, `get_capabilities()` | OpenAI 호환 |

`llm_clients/__init__.py`는 `BaseLLMClient`와 `create_llm_client`만 내보낸다.

## `BaseLLMClient`

```python
class BaseLLMClient(ABC):
    def __init__(self, model: str, base_url: str | None = None, **kwargs):
        self.model, self.base_url, self.kwargs = model, base_url, kwargs

    def get_provider_name(self) -> str      # self.provider, 없으면 클래스명에서 "Client" 제거
    def warn_if_unknown_model(self) -> None # RuntimeWarning, 절대 예외를 던지지 않음
    @abstractmethod
    def get_llm(self) -> Any
    @abstractmethod
    def validate_model(self) -> bool
```

### `normalize_content(response)`

일부 프로바이더는 콘텐츠를 타입 블록 리스트로 반환한다. 예:
`[{'type': 'reasoning', ...}, {'type': 'text', 'text': '...'}]` — OpenAI
Responses API, Gemini 3, 그리고 확장 사고나 도구 사용을 하는 Anthropic이 그렇다.
하위 에이전트들은 `response.content`가 `str`이라고 가정하므로, 이 함수가 `text`
블록을 이어 붙이고 reasoning/메타데이터 블록은 버린다. 모든 프로바이더 클라이언트에는
`invoke()`에서 이를 적용하는 `Normalized*` 채팅 서브클래스가 있다.

**클라이언트를 추가하면서 이를 빠뜨리면, 추론 모델에서
`response.content`를 쓰는 모든 에이전트가 리스트를 받게 되고 이후의 문자열
포매팅이 깨진다.**

## OpenAI 호환 클라이언트

### `ProviderSpec` 필드

| 필드 | 기본값 | 의미 |
|---|---|---|
| `chat_class` | `NormalizedChatOpenAI` | 와이어 포맷 특이사항을 담는 서브클래스 |
| `base_url` | `None` | 기본 엔드포인트. `None` → SDK 기본값 |
| `base_url_env` | `None` | 이를 덮어쓰는 환경변수 (현재는 `OLLAMA_BASE_URL`뿐) |
| `key_optional` | `False` | 키를 요구하거나 묻지 않음 |
| `placeholder_key` | `"EMPTY"` | 키가 없을 때 전송 |
| `require_base_url` | `False` | 해결되지 않으면 예외 |
| `use_responses_api` | `False` | 네이티브 OpenAI `/v1/responses` |

### `get_llm()` 해석 순서

1. `warn_if_unknown_model()`
2. `spec = OPENAI_COMPATIBLE_PROVIDERS.get(self.provider)`; `chat_cls = spec.chat_class`
3. base_url: `self.base_url` → `os.environ[spec.base_url_env]` → `spec.base_url`.
   `require_base_url`인데 아무것도 해결되지 않으면 `backend_url` /
   `TRADINGAGENTS_LLM_BACKEND_URL`을 짚어 주고 vLLM / LM Studio 예시를 담은 `ValueError`를 낸다.
4. API 키: `os.environ[get_api_key_env(provider)]` → 없고 `key_optional`이면
   `spec.placeholder_key` → 아니면 환경변수 이름을 알려 주고 `.env` 항목을
   제안하는 `ValueError`를 낸다.
5. Responses API는 `spec.use_responses_api and _is_native_openai_base_url(base_url)`일 때만.
   `_is_native_openai_base_url`은 호스트를 파싱해서 `api.openai.com` 또는 임의의
   `*.openai.com`을 허용한다. 값이 없으면 네이티브로 간주한다(upstream #1024).
6. 허용 목록인 `_PASSTHROUGH_KWARGS`를 전달하되,
   `_supports_reasoning_effort(model)`가 거짓이면 `reasoning_effort`는 건너뛴다
   (`_OPENAI_REASONING_MODEL = re.compile(r"^(gpt-5|o[1-9])")`).
7. `return chat_cls(**llm_kwargs)`

### 채팅 서브클래스

| 클래스 | 용도 |
|---|---|
| `NormalizedChatOpenAI` | `invoke`에서 `normalize_content` 적용. 능력을 인지하는 `with_structured_output`(`supports_tool_choice`가 거짓이면 `tool_choice` 억제) |
| `DeepSeekChatOpenAI` | `_get_request_payload` / `_create_chat_result`를 오버라이드해 다음 요청에 `reasoning_content`를 되돌려 보낸다 (그러지 않으면 thinking 모델이 400을 낸다) |
| `MinimaxChatOpenAI` | `_get_request_payload`를 오버라이드해 M2.x에 `reasoning_split=True`를 설정, `<think>`가 `content` 대신 `reasoning_details`로 가게 한다 (upstream #826) |
| `LocalCompatibleChatOpenAI` | 범용 로컬 서버를 위한 관대한 처리 |

`_input_to_messages(input_)`는 LangChain이 넘겨주는 여러 형태를 정규화한다.

## Anthropic 클라이언트

```python
_PASSTHROUGH = ("timeout", "max_retries", "api_key", "max_tokens",
                "temperature", "callbacks", "http_client",
                "http_async_client", "effort")
```

`_supports_effort(model)`는 확장 사고용 `effort` 파라미터를
**계열별 최소 버전**으로 제어하므로, 새 릴리스에 대해 전방 호환된다:

```python
_EFFORT_MODEL = re.compile(r"^claude-(opus|sonnet|fable)-(\d+)(?:-(\d+))?$")
_EFFORT_MIN_VERSION = {"opus": (4, 5), "sonnet": (4, 6), "fable": (5, 0)}
_EFFORT_EXACT = {"claude-mythos-preview", "claude-mythos-5"}
```

숫자가 하나뿐인 버전(`sonnet-5`, `fable-5`)은 마이너 `0`으로 파싱된다. 검증된
동작:

| 모델 | effort |
|---|---|
| `claude-fable-5` | ✓ |
| `claude-opus-4-8`, `claude-opus-4-7` | ✓ |
| `claude-sonnet-5`, `claude-sonnet-4-6` | ✓ |
| `claude-sonnet-4-5` | ✗ |
| `claude-haiku-4-5` (모든 Haiku) | ✗ |
| `claude-opus-4-4` | ✗ |

지원하지 않는 모델은 HTTP 400 `"This model does not support the effort
parameter"`를 반환하므로(upstream #831), `get_llm()`이 kwarg를 보내지 않고 제거한다.
`claude-mythos-5`는 Fable 5의 쌍둥이다(Project Glasswing). 두 mythos 이름 모두
표준 형식이 아니라서 `_EFFORT_EXACT`를 통해 정규식을 우회한다.

`NormalizedChatAnthropic.invoke()`는 `normalize_content`를 적용한다. 확장 사고와
도구 사용이 모두 블록 리스트를 반환하기 때문에 필요하다.

## Google 클라이언트

`NormalizedChatGoogleGenerativeAI`는 `ChatGoogleGenerativeAI`를 상속하고
`invoke()`에서 콘텐츠를 정규화한다(일부 모드에서 Gemini는
`[{'type': 'text', 'text': '...'}]`를 반환한다).

Thinking 설정:

```python
thinking_level = self.kwargs.get("thinking_level")
if thinking_level:
    if "pro" in self.model.lower() and thinking_level == "minimal":
        thinking_level = "low"          # Pro는 "minimal"을 거부한다
    llm_kwargs["thinking_level"] = thinking_level
```

Gemini 3.x는 **문자열** `thinking_level`을 받는다. 정수형 `thinking_budget`
(`-1` 동적 / `0` 비활성)은 단종된 2.5 라인의 것이며 이 코드베이스에는 더 이상
없다. `thinking_budget`을 언급하는 문서는 낡은 것이다.

## Azure 클라이언트

```python
llm_kwargs = {
    "azure_deployment": os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", self.model),
    ...
}
```

필수 환경변수: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_VERSION`
(예: `2025-03-01-preview`). `AZURE_OPENAI_DEPLOYMENT_NAME`은 선택이며 기본값은
모델 이름이다. `validate_model()`은 무엇이든 `True`를 반환한다. 배포된 이름은
무엇이든 유효하고, 그래서 `azure`에는 `MODEL_OPTIONS` 항목이 없다.

## Bedrock 클라이언트

선택적 의존성: `pip install "tradingagents[bedrock]"` → `langchain-aws>=1.5.0`.
`_bedrock_class()`는 `ChatBedrockConverse`를 **필요할 때만** 임포트하고 상속하므로,
코어 설치에는 `langchain-aws`도 `boto3`도 필요 없다.
모듈이 없으면 `tests/test_bedrock_provider.py`는 건너뛴다.

- 인증: AWS 자격증명 체인(환경변수, 프로파일, 인스턴스 역할). 단일 키 환경변수가
  없으므로 `PROVIDER_API_KEY_ENV["bedrock"] is None`이다.
- 리전: `us-west-2`로 폴백한다. Bedrock에는 전역 기본 리전이 없고 us-west-2가 가장
  넓은 모델 집합을 제공한다. 베어러 토큰에는 리전 정보가 없다.
- 모델: Bedrock 모델 ID 또는 교차 리전 추론 프로파일 ID. 예:
  `us.anthropic.claude-opus-4-8-v1:0`.

## 능력 테이블 행

| 행 | supports_tool_choice | json_mode | json_schema | preferred | 추가 |
|---|---|---|---|---|---|
| `_DEFAULT` | ✓ | ✓ | ✓ | `function_calling` | — |
| `_DEEPSEEK_CHAT` | ✓ | ✓ | ✗ | `function_calling` | — |
| `_DEEPSEEK_THINKING` | ✗ | ✓ | ✗ | `function_calling` | `requires_reasoning_content_roundtrip` |
| `_MINIMAX_THINKING` | ✗ | ✗ | ✗ | `function_calling` | `requires_reasoning_split` |

정확한 ID 맵 `_BY_ID`는 `deepseek-chat`, `deepseek-reasoner`,
`deepseek-v4-flash`, `deepseek-v4-pro`, 그리고 `MiniMax-M2` / `M2.1` / `M2.5` / `M2.7`
(`-highspeed` 유무 포함)을 다룬다.

전방 호환 패턴 `_BY_PATTERN` — `^deepseek-v\d`, `^deepseek-reasoner`,
`^MiniMax-M\d` — 덕분에 새 변형도 특이사항을 자동으로 물려받는다.

해석 순서: 정확한 ID → 패턴 → `_DEFAULT`.

## `TradingAgentsGraph`가 LLM을 만드는 방식

```python
llm_kwargs = self._get_provider_kwargs()
if self.callbacks:
    llm_kwargs["callbacks"] = self.callbacks

deep_client  = create_llm_client(provider=config["llm_provider"],
                                 model=config["deep_think_llm"],
                                 base_url=config.get("backend_url"), **llm_kwargs)
quick_client = create_llm_client(provider=config["llm_provider"],
                                 model=config["quick_think_llm"],
                                 base_url=config.get("backend_url"), **llm_kwargs)
self.deep_thinking_llm  = deep_client.get_llm()
self.quick_thinking_llm = quick_client.get_llm()
```

`_get_provider_kwargs()`는 프로바이더별로 분기한 뒤, 프로바이더 공통 노브 두 개를 처리한다:

```python
provider == "google"    → thinking_level   = config["google_thinking_level"]
provider == "openai"    → reasoning_effort = config["openai_reasoning_effort"]
provider == "anthropic" → effort           = config["anthropic_effort"]

temperature      → float(config["temperature"])          if set and != ""
max_retries      → _coerce_max_retries(config["llm_max_retries"])  if set and != ""
```

알아둘 만한 결과 두 가지:

- **추론 노브는 프로바이더로 게이팅된다.** xAI가 `OpenAIClient`를 거치더라도
  `llm_provider="xai"` 상태에서 `openai_reasoning_effort`를 설정하면 조용히
  아무 일도 일어나지 않는다. 다른 프로바이더에 노브를 주고 싶으면 여기에 분기를 추가한다.
- **콜백은 그래프 인자가 아니라 생성자를 통해 LLM에 전달된다.** 도구 실행
  콜백은 별개다 — `Propagator.get_graph_args(callbacks=...)`가 그것들을
  LangGraph 설정에 넣는다.

`_coerce_max_retries(value)`는 bool(`llm_max_retries must be an integer,
not a boolean`)과 음수를 거부하므로, 잘못된 설정은 재시도를 조용히 비활성화하는 대신
시작 시점에 실패한다.

## 모델 카탈로그 구조

```python
MODEL_OPTIONS: dict[str, dict[str, list[tuple[str, str]]]]
# provider -> {"quick": [(label, model_id), ...], "deep": [...]}
```

공유 리스트로 이중 리전 프로바이더의 중복을 피한다. `_QWEN_MODELS`,
`_GLM_MODELS`, `_MINIMAX_MODELS`는 각각 글로벌 키와 CN 키 양쪽에서 참조된다.
`_CUSTOM_ONLY`(두 모드 모두에 대해 `("Custom model ID", "custom")` 항목 하나)는
`openai_compatible`, `mistral`, `kimi`, `groq`, `nvidia`, `bedrock`을 담당한다.

`get_known_models()`는 카탈로그를 `{provider: sorted(model_ids)}`로 접고,
`validators.VALID_MODELS`는 거기서 `_ANY_MODEL_PROVIDERS`를 뺀 것이다. 즉 CLI
드롭다운과 검증기는 문자 그대로 같은 데이터이며 서로 어긋날 수 없다.

따라서 `VALID_MODELS`는 정확히 11개 프로바이더를 다룬다: `anthropic`, `deepseek`,
`glm`, `glm-cn`, `google`, `minimax`, `minimax-cn`, `openai`, `qwen`, `qwen-cn`,
`xai`.

`("Custom model ID", "custom")` 카탈로그 행을 가진 7개 프로바이더(`deepseek`, `qwen`,
`qwen-cn`, `glm`, `glm-cn`, `minimax`, `minimax-cn`)에 대해서는 센티널 `"custom"`이
`VALID_MODELS`의 원소라는 점에 주의한다. 이는 CLI 마커일 뿐 실제 모델 ID가 아니며,
CLI가 클라이언트에 도달하기 전에 사용자 입력으로 치환한다.
코드에서 `"custom"`을 넘기면 검증은 통과하지만 API 호출에서 실패한다.

## 카탈로그의 프로바이더별 참고사항

- **DeepSeek**: `deepseek-chat` / `deepseek-reasoner` 별칭은 2026-07-24에
  폐기되었고 이제 V4 Flash로 매핑된다. 카탈로그는 V4 ID를 직접 노출한다.
  V4 Flash는 thinking 모드와 non-thinking 모드를 모두 제공한다.
- **Qwen**: 버전이 붙은 ID만 노출한다. 버전 없는 별칭(`qwen-plus`,
  `qwen-flash`)은 백엔드 모델이 바뀌는 자동 업그레이드 포인터이므로, 항상 최신을
  원하는 사용자는 "Custom model ID"로 직접 입력해야 한다.
- **Ollama**: 엔드포인트를 `OLLAMA_BASE_URL`로 바꿀 수 있어서 라벨에 "local" 표시를
  넣지 않는다. `cli.utils.confirm_ollama_endpoint()`가 프로바이더 선택 직후에
  해석된 엔드포인트를 보여 준다.
- **MiniMax**: M3는 1M 토큰 컨텍스트 윈도를 가지며, M2.x 라인은 204,800이다.
