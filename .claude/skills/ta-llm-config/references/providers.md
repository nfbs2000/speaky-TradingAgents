# LLM Provider Client Details

## Client Files

| File | Contents | Serves |
|------|----------|--------|
| `llm_clients/base_client.py` | `BaseLLMClient`, `normalize_content()` | all |
| `llm_clients/factory.py` | `create_llm_client()` | entry point |
| `llm_clients/openai_client.py` | `ProviderSpec`, `OPENAI_COMPATIBLE_PROVIDERS`, `OpenAIClient`, `NormalizedChatOpenAI`, `DeepSeekChatOpenAI`, `MinimaxChatOpenAI`, `LocalCompatibleChatOpenAI`, `is_openai_compatible()` | 16 providers |
| `llm_clients/anthropic_client.py` | `AnthropicClient`, `NormalizedChatAnthropic`, `_supports_effort()` | Anthropic |
| `llm_clients/google_client.py` | `GoogleClient`, `NormalizedChatGoogleGenerativeAI` | Google |
| `llm_clients/azure_client.py` | `AzureOpenAIClient`, `NormalizedAzureChatOpenAI` | Azure OpenAI |
| `llm_clients/bedrock_client.py` | `BedrockClient`, `_bedrock_class()` | Amazon Bedrock |
| `llm_clients/api_key_env.py` | `PROVIDER_API_KEY_ENV`, `get_api_key_env()` | all + CLI |
| `llm_clients/model_catalog.py` | `MODEL_OPTIONS`, `get_model_options()`, `get_known_models()` | CLI + validators |
| `llm_clients/validators.py` | `VALID_MODELS`, `validate_model()`, `_ANY_MODEL_PROVIDERS` | all |
| `llm_clients/capabilities.py` | `ModelCapabilities`, `get_capabilities()` | OpenAI-compatible |

`llm_clients/__init__.py` exports only `BaseLLMClient` and `create_llm_client`.

## `BaseLLMClient`

```python
class BaseLLMClient(ABC):
    def __init__(self, model: str, base_url: str | None = None, **kwargs):
        self.model, self.base_url, self.kwargs = model, base_url, kwargs

    def get_provider_name(self) -> str      # self.provider, else classname minus "Client"
    def warn_if_unknown_model(self) -> None # RuntimeWarning, never raises
    @abstractmethod
    def get_llm(self) -> Any
    @abstractmethod
    def validate_model(self) -> bool
```

### `normalize_content(response)`

Several providers return content as a list of typed blocks, e.g.
`[{'type': 'reasoning', ...}, {'type': 'text', 'text': '...'}]` — the OpenAI
Responses API, Gemini 3, and Anthropic with extended thinking or tool use.
Downstream agents assume `response.content` is a `str`, so this joins the `text`
blocks and discards reasoning/metadata blocks. Every provider client has a
`Normalized*` chat subclass whose `invoke()` applies it.

**If you add a client and skip this, every agent that does
`response.content` on a reasoning model gets a list and downstream string
formatting breaks.**

## OpenAI-Compatible Client

### `ProviderSpec` fields

| Field | Default | Meaning |
|---|---|---|
| `chat_class` | `NormalizedChatOpenAI` | subclass carrying wire-format quirks |
| `base_url` | `None` | default endpoint; `None` → SDK default |
| `base_url_env` | `None` | env var that overrides it (only `OLLAMA_BASE_URL` today) |
| `key_optional` | `False` | don't require or prompt for a key |
| `placeholder_key` | `"EMPTY"` | sent when no key is available |
| `require_base_url` | `False` | raise if none resolved |
| `use_responses_api` | `False` | native OpenAI `/v1/responses` |

### `get_llm()` resolution order

1. `warn_if_unknown_model()`
2. `spec = OPENAI_COMPATIBLE_PROVIDERS.get(self.provider)`; `chat_cls = spec.chat_class`
3. base_url: `self.base_url` → `os.environ[spec.base_url_env]` → `spec.base_url`.
   `require_base_url` with none resolved raises a `ValueError` that names
   `backend_url` / `TRADINGAGENTS_LLM_BACKEND_URL` and gives vLLM / LM Studio examples.
4. API key: `os.environ[get_api_key_env(provider)]` → if absent and `key_optional`,
   `spec.placeholder_key` → else raise a `ValueError` naming the env var and
   suggesting a `.env` entry.
5. Responses API only if `spec.use_responses_api and _is_native_openai_base_url(base_url)`.
   `_is_native_openai_base_url` parses the host and accepts `api.openai.com` or any
   `*.openai.com`; unset counts as native (upstream #1024).
6. Forward the whitelisted `_PASSTHROUGH_KWARGS`, skipping `reasoning_effort` when
   `_supports_reasoning_effort(model)` is false
   (`_OPENAI_REASONING_MODEL = re.compile(r"^(gpt-5|o[1-9])")`).
7. `return chat_cls(**llm_kwargs)`

### Chat subclasses

| Class | Purpose |
|---|---|
| `NormalizedChatOpenAI` | `normalize_content` on `invoke`; capability-aware `with_structured_output` (suppresses `tool_choice` when `supports_tool_choice` is false) |
| `DeepSeekChatOpenAI` | overrides `_get_request_payload` / `_create_chat_result` to echo `reasoning_content` back on the next request (thinking models 400 otherwise) |
| `MinimaxChatOpenAI` | overrides `_get_request_payload` to set `reasoning_split=True` for M2.x so `<think>` lands in `reasoning_details` instead of `content` (upstream #826) |
| `LocalCompatibleChatOpenAI` | leniency for generic local servers |

`_input_to_messages(input_)` normalizes the several shapes LangChain hands in.

## Anthropic Client

```python
_PASSTHROUGH = ("timeout", "max_retries", "api_key", "max_tokens",
                "temperature", "callbacks", "http_client",
                "http_async_client", "effort")
```

`_supports_effort(model)` gates the extended-thinking `effort` parameter by a
**per-family minimum version**, so it is forward-compatible with new releases:

```python
_EFFORT_MODEL = re.compile(r"^claude-(opus|sonnet|fable)-(\d+)(?:-(\d+))?$")
_EFFORT_MIN_VERSION = {"opus": (4, 5), "sonnet": (4, 6), "fable": (5, 0)}
_EFFORT_EXACT = {"claude-mythos-preview", "claude-mythos-5"}
```

A single-number version (`sonnet-5`, `fable-5`) parses as minor `0`. Verified
behavior:

| Model | effort |
|---|---|
| `claude-fable-5` | ✓ |
| `claude-opus-4-8`, `claude-opus-4-7` | ✓ |
| `claude-sonnet-5`, `claude-sonnet-4-6` | ✓ |
| `claude-sonnet-4-5` | ✗ |
| `claude-haiku-4-5` (any Haiku) | ✗ |
| `claude-opus-4-4` | ✗ |

Unsupported models return HTTP 400 `"This model does not support the effort
parameter"` (upstream #831), so `get_llm()` drops the kwarg instead of sending it.
`claude-mythos-5` is the Fable 5 twin (Project Glasswing); both mythos names are
non-standard so they bypass the regex via `_EFFORT_EXACT`.

`NormalizedChatAnthropic.invoke()` applies `normalize_content` — needed because
extended thinking and tool use both return block lists.

## Google Client

`NormalizedChatGoogleGenerativeAI` extends `ChatGoogleGenerativeAI` and normalizes
content in `invoke()` (Gemini returns `[{'type': 'text', 'text': '...'}]` in some
modes).

Thinking configuration:

```python
thinking_level = self.kwargs.get("thinking_level")
if thinking_level:
    if "pro" in self.model.lower() and thinking_level == "minimal":
        thinking_level = "low"          # Pro rejects "minimal"
    llm_kwargs["thinking_level"] = thinking_level
```

Gemini 3.x takes the **string** `thinking_level`. The integer `thinking_budget`
(`-1` dynamic / `0` disabled) belonged to the retired 2.5 line and is no longer in
this codebase — a doc mentioning `thinking_budget` is stale.

## Azure Client

```python
llm_kwargs = {
    "azure_deployment": os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", self.model),
    ...
}
```

Required env: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_VERSION`
(e.g. `2025-03-01-preview`). `AZURE_OPENAI_DEPLOYMENT_NAME` is optional and defaults
to the model name. `validate_model()` returns `True` for anything — any deployed
name is valid, which is why `azure` has no `MODEL_OPTIONS` entry.

## Bedrock Client

Optional dependency: `pip install "tradingagents[bedrock]"` → `langchain-aws>=1.5.0`.
`_bedrock_class()` imports and subclasses `ChatBedrockConverse` **on demand**, so
neither `langchain-aws` nor `boto3` is required for a core install.
`tests/test_bedrock_provider.py` skips when the module is absent.

- Auth: the AWS credential chain (env vars, profile, instance role) — there is no
  single key env var, so `PROVIDER_API_KEY_ENV["bedrock"] is None`.
- Region: falls back to `us-west-2` — Bedrock has no global default region and
  us-west-2 hosts the broadest model set. The bearer token carries no region.
- Model: a Bedrock model ID or cross-region inference profile ID, e.g.
  `us.anthropic.claude-opus-4-8-v1:0`.

## Capability Rows

| Row | supports_tool_choice | json_mode | json_schema | preferred | extra |
|---|---|---|---|---|---|
| `_DEFAULT` | ✓ | ✓ | ✓ | `function_calling` | — |
| `_DEEPSEEK_CHAT` | ✓ | ✓ | ✗ | `function_calling` | — |
| `_DEEPSEEK_THINKING` | ✗ | ✓ | ✗ | `function_calling` | `requires_reasoning_content_roundtrip` |
| `_MINIMAX_THINKING` | ✗ | ✗ | ✗ | `function_calling` | `requires_reasoning_split` |

Exact-ID map `_BY_ID` covers `deepseek-chat`, `deepseek-reasoner`,
`deepseek-v4-flash`, `deepseek-v4-pro`, and `MiniMax-M2` / `M2.1` / `M2.5` / `M2.7`
(± `-highspeed`).

Forward-compat patterns `_BY_PATTERN` — `^deepseek-v\d`, `^deepseek-reasoner`,
`^MiniMax-M\d` — so new variants inherit the quirks automatically.

Resolution order: exact ID → pattern → `_DEFAULT`.

## How `TradingAgentsGraph` Creates LLMs

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

`_get_provider_kwargs()` is provider-branched, then two cross-provider knobs:

```python
provider == "google"    → thinking_level   = config["google_thinking_level"]
provider == "openai"    → reasoning_effort = config["openai_reasoning_effort"]
provider == "anthropic" → effort           = config["anthropic_effort"]

temperature      → float(config["temperature"])          if set and != ""
max_retries      → _coerce_max_retries(config["llm_max_retries"])  if set and != ""
```

Two consequences worth knowing:

- **Reasoning knobs are provider-gated.** Setting `openai_reasoning_effort` while
  `llm_provider="xai"` silently does nothing, even though xAI goes through
  `OpenAIClient`. Add a branch here if you want a knob on another provider.
- **Callbacks reach the LLM via the constructor**, not via graph args. Tool-execution
  callbacks are separate — `Propagator.get_graph_args(callbacks=...)` puts those in
  the LangGraph config.

`_coerce_max_retries(value)` rejects booleans (`llm_max_retries must be an integer,
not a boolean`) and negatives, so a misconfiguration fails at startup instead of
silently disabling retries.

## Model Catalog Layout

```python
MODEL_OPTIONS: dict[str, dict[str, list[tuple[str, str]]]]
# provider -> {"quick": [(label, model_id), ...], "deep": [...]}
```

Shared lists avoid duplication for dual-region providers: `_QWEN_MODELS`,
`_GLM_MODELS`, `_MINIMAX_MODELS` are each referenced by both the global and CN keys.
`_CUSTOM_ONLY` (a single `("Custom model ID", "custom")` entry for both modes) serves
`openai_compatible`, `mistral`, `kimi`, `groq`, `nvidia`, `bedrock`.

`get_known_models()` collapses the catalog into `{provider: sorted(model_ids)}`, and
`validators.VALID_MODELS` is that dict minus `_ANY_MODEL_PROVIDERS`. So the CLI
dropdown and the validator are literally the same data — they cannot drift.

`VALID_MODELS` therefore covers exactly 11 providers: `anthropic`, `deepseek`,
`glm`, `glm-cn`, `google`, `minimax`, `minimax-cn`, `openai`, `qwen`, `qwen-cn`,
`xai`.

Note the sentinel `"custom"` is a member of `VALID_MODELS` for the seven providers
that keep a `("Custom model ID", "custom")` catalog row (`deepseek`, `qwen`,
`qwen-cn`, `glm`, `glm-cn`, `minimax`, `minimax-cn`). It is a CLI marker, not a real
model ID — the CLI replaces it with the user's input before it reaches a client.
Passing `"custom"` programmatically would pass validation and then fail at the API.

## Provider-Specific Notes from the Catalog

- **DeepSeek**: the `deepseek-chat` / `deepseek-reasoner` aliases were deprecated
  2026-07-24 and now map to V4 Flash. The catalog exposes the V4 IDs directly.
  V4 Flash serves both thinking and non-thinking modes.
- **Qwen**: only versioned IDs are exposed. Version-less aliases (`qwen-plus`,
  `qwen-flash`) are auto-upgrading pointers whose backing model shifts, so users who
  want auto-latest must enter them via "Custom model ID".
- **Ollama**: labels omit a "local" marker because the endpoint is configurable via
  `OLLAMA_BASE_URL`; `cli.utils.confirm_ollama_endpoint()` surfaces the resolved
  endpoint right after provider selection.
- **MiniMax**: M3 carries a 1M-token context window; the M2.x line is 204,800.
