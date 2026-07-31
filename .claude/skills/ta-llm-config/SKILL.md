---
name: ta-llm-config
description: This skill should be used when the user asks to "change LLM provider", "switch to Claude", "use Gemini", "configure Ollama", "change model", "switch from GPT to Claude", "set up local model", "add new LLM provider", "change deep thinking model", "configure API key", "tune model parameters", "set reasoning effort", "set thinking level", "use Azure OpenAI", "use Bedrock", "vLLM", "LM Studio", or mentions LLM/model configuration for TradingAgents.
version: 0.2.0
---

# TradingAgents LLM Configuration

Configure LLM providers, models, and inference parameters.

## Configuration

LLM settings live in `tradingagents/default_config.py`. Every one of them has a
`TRADINGAGENTS_*` env-var override, so **no code edit is needed to switch providers**:

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

Overrides are declared in one table, `_ENV_OVERRIDES` in `default_config.py`.
**To expose a new config key for env override, add a row there — nothing else.**
Values are coerced to the type of the existing default, and an invalid value
(`treu` for a bool, a non-numeric int) raises `ValueError` at import time rather
than silently misconfiguring an unattended run.

`backend_url` defaults to **`None`**, not an OpenAI URL: each client falls back to
its own provider default. A provider-specific URL as the global default used to
leak (OpenAI's `/v1` was being forwarded to Gemini, producing malformed URLs).

## Supported Providers

### Native clients (genuinely different APIs)

| Provider | Config value | Client | API key env |
|---|---|---|---|
| Anthropic | `anthropic` | `AnthropicClient` | `ANTHROPIC_API_KEY` |
| Google | `google` | `GoogleClient` | `GOOGLE_API_KEY` |
| Azure OpenAI | `azure` | `AzureOpenAIClient` | `AZURE_OPENAI_API_KEY` |
| Amazon Bedrock | `bedrock` | `BedrockClient` | none — AWS credential chain |

### OpenAI-compatible family (one registry row each)

| Provider | Config value | Default base URL | API key env |
|---|---|---|---|
| OpenAI | `openai` | SDK default (Responses API) | `OPENAI_API_KEY` |
| xAI | `xai` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| DeepSeek | `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| Qwen (intl) | `qwen` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Qwen (CN) | `qwen-cn` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_CN_API_KEY` |
| GLM / Z.AI | `glm` | `https://api.z.ai/api/paas/v4/` | `ZHIPU_API_KEY` |
| GLM (CN) | `glm-cn` | `https://open.bigmodel.cn/api/paas/v4/` | `ZHIPU_CN_API_KEY` |
| MiniMax | `minimax` | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` |
| MiniMax (CN) | `minimax-cn` | `https://api.minimaxi.com/v1` | `MINIMAX_CN_API_KEY` |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| Mistral | `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| Kimi / Moonshot | `kimi` | `https://api.moonshot.ai/v1` | `MOONSHOT_API_KEY` |
| Groq | `groq` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| NVIDIA NIM | `nvidia` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| Ollama | `ollama` | `http://localhost:11434/v1` (or `OLLAMA_BASE_URL`) | none |
| Generic endpoint | `openai_compatible` | **required** from `backend_url` | `OPENAI_COMPATIBLE_API_KEY` (optional) |

Dual-region providers keep separate keys on purpose — international and China
accounts are not interchangeable (upstream #758).

Use `openai_compatible` for vLLM, LM Studio, llama.cpp, or any relay: set
`backend_url` to e.g. `http://localhost:8000/v1`. Omitting it raises a
`ValueError` naming the fix.

## Two-LLM Architecture

- **`quick_think_llm`** — 4 analysts, Bull, Bear, Trader, 3 risk debators, Reflector
- **`deep_think_llm`** — Research Manager, Portfolio Manager (the final decisions)

Both clients are created in `TradingAgentsGraph.__init__` from the **same provider**;
there is no per-agent provider mixing.

## Provider Switching

Preferred — `.env`, no code edit:

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
# Local Ollama
TRADINGAGENTS_LLM_PROVIDER=ollama
TRADINGAGENTS_DEEP_THINK_LLM=glm-4.7-flash:latest
TRADINGAGENTS_QUICK_THINK_LLM=qwen3:latest
OLLAMA_BASE_URL=http://localhost:11434/v1     # optional; remote host works too
```

```bash
# Any OpenAI-compatible server (vLLM / LM Studio)
TRADINGAGENTS_LLM_PROVIDER=openai_compatible
TRADINGAGENTS_LLM_BACKEND_URL=http://localhost:8000/v1
TRADINGAGENTS_DEEP_THINK_LLM=my-served-model
TRADINGAGENTS_QUICK_THINK_LLM=my-served-model
```

Or programmatically:

```python
config = {**DEFAULT_CONFIG, "llm_provider": "anthropic",
          "deep_think_llm": "claude-fable-5", "quick_think_llm": "claude-haiku-4-5"}
graph = TradingAgentsGraph(config=config)
```

The interactive CLI (`tradingagents analyze`) prompts for provider, models, and any
missing API key, and skips the interactive reasoning/thinking prompt when the
matching env var is already set.

## Factory Architecture

`llm_clients/factory.py::create_llm_client(provider, model, base_url=None, **kwargs)`
→ `BaseLLMClient`. Provider modules are imported **lazily** so importing the factory
does not pull in heavy SDKs or fail on absent keys.

Dispatch order — native APIs first (so their string check does not import the OpenAI
client), then the registry:

```python
anthropic → AnthropicClient
google    → GoogleClient
azure     → AzureOpenAIClient
bedrock   → BedrockClient
is_openai_compatible(p) → OpenAIClient(model, base_url, provider=p)
else      → ValueError(f"Unsupported LLM provider: {provider}")
```

Every client implements `get_llm()` (returns a LangChain chat model) and
`validate_model()`. `BaseLLMClient.warn_if_unknown_model()` emits a `RuntimeWarning`
("Continuing anyway") rather than blocking — an unknown model is a warning, not an
error.

`base_client.normalize_content(response)` flattens list-of-typed-blocks content
(OpenAI Responses API, Gemini 3, Anthropic extended thinking) down to a plain
string, since downstream agents assume `response.content` is `str`. Each provider
client has a `Normalized*` subclass that applies it in `invoke()`.

## The Provider Registry

`llm_clients/openai_client.py::OPENAI_COMPATIBLE_PROVIDERS: dict[str, ProviderSpec]`
is the single source of truth for the OpenAI-compatible family. One row replaces
what used to be a base-URL dict plus per-provider auth and client-class branches:

```python
@dataclass(frozen=True)
class ProviderSpec:
    chat_class: type = NormalizedChatOpenAI   # provider wire-format quirks
    base_url: str | None = None               # default endpoint (None → SDK default)
    base_url_env: str | None = None           # env override, e.g. OLLAMA_BASE_URL
    key_optional: bool = False                # don't require/prompt for a key
    placeholder_key: str = "EMPTY"            # sent when no key available
    require_base_url: bool = False            # error if none resolved
    use_responses_api: bool = False           # native OpenAI Responses API
```

`base_url` precedence: explicit client `base_url` (i.e. config /
`TRADINGAGENTS_LLM_BACKEND_URL`) → `spec.base_url_env` → `spec.base_url` → SDK default.

The Responses API is enabled only when `spec.use_responses_api` **and**
`_is_native_openai_base_url(base_url)` — pointing the `openai` provider at a proxy
or local server keeps it on Chat Completions, since `/v1/responses` only exists on
native OpenAI (upstream #1024).

API-key env names live separately in `llm_clients/api_key_env.py::PROVIDER_API_KEY_ENV`,
the single source read by both the client and the CLI's key prompt. Only
*behavioral* differences live in the registry.

## Provider-Specific Parameters

### OpenAI
- `openai_reasoning_effort`: `"low" | "medium" | "high"`
- `_OPENAI_REASONING_MODEL = re.compile(r"^(gpt-5|o[1-9])")` gates it;
  `reasoning_effort` is silently dropped for non-reasoning models.

### Anthropic
- `anthropic_effort`: `"low" | "medium" | "high"` → forwarded as `effort`
- `_supports_effort(model)` gates it by family minimum: **Opus ≥ 4.5, Sonnet ≥ 4.6,
  Fable ≥ 5.0**. Sonnet 4.5 and **every Haiku** return HTTP 400
  `"This model does not support the effort parameter"` (upstream #831), so the kwarg
  is dropped for them rather than passed through. Two preview names are whitelisted
  explicitly: `claude-mythos-preview`, `claude-mythos-5`.
- Passthrough kwargs: `timeout`, `max_retries`, `api_key`, `max_tokens`,
  `temperature`, `callbacks`, `http_client`, `http_async_client`, `effort`.

### Google
- `google_thinking_level`: a **string** (`"high"`, `"low"`, `"minimal"`, …).
  Gemini 3.x takes `thinking_level`; the integer `thinking_budget` was for the
  retired 2.5 line and is gone.
- Pro models reject `"minimal"`, so it is rewritten to `"low"` automatically.

### Azure
Requires `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_VERSION`
(e.g. `2025-03-01-preview`), and optionally `AZURE_OPENAI_DEPLOYMENT_NAME`
(defaults to the model name).

### Bedrock
Optional install: `pip install "tradingagents[bedrock]"` (pulls `langchain-aws`).
Authenticates through the AWS credential chain — no key env var. Region resolution
falls back to `us-west-2` (Bedrock has no global default; us-west-2 hosts the
broadest model set). The model name is a Bedrock model ID or cross-region inference
profile ID, e.g. `us.anthropic.claude-opus-4-8-v1:0`.

### DeepSeek / MiniMax quirks
Handled declaratively in `llm_clients/capabilities.py` — see below.

### Cross-provider
- `temperature`: forwarded to every provider when set. Reasoning models largely
  ignore it, and no setting makes output bit-identical across runs.
- `llm_max_retries`: SDK retry budget forwarded to every provider chat client.
  `None` leaves each SDK at its own default (usually 2). Raise it to ride out
  bursty 429 throttling instead of aborting a run (upstream #1091). Validated by
  `_coerce_max_retries` — rejects booleans and negatives loudly.

## The Capability Table

`llm_clients/capabilities.py` is the one place that knows which model IDs reject
which parameters. Client subclasses call `get_capabilities(model_name)` instead of
hardcoding model-name `if` ladders:

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

Resolution: exact ID in `_BY_ID`, then regex in `_BY_PATTERN`
(`^deepseek-v\d`, `^deepseek-reasoner`, `^MiniMax-M\d`), then `_DEFAULT`.

Why it matters for this project: the four structured-output agents call
`with_structured_output()`. DeepSeek thinking models accept `tools` but **400 on
`tool_choice`**, and MiniMax M2.x restricts `tool_choice` to `{"none","auto"}` while
LangChain sends a function-spec dict. `supports_tool_choice=False` makes
`NormalizedChatOpenAI` suppress the kwarg so the schema still ships as a tool.

**Adding a new model with a quirk means editing this table, not the client code.**

## Adding a New Provider

### If it speaks the OpenAI Chat Completions API (most cases) — no new client

1. Add one row to `OPENAI_COMPATIBLE_PROVIDERS` in `openai_client.py`.
2. Add its key env var to `PROVIDER_API_KEY_ENV` in `api_key_env.py` (or `None`).
3. Add a `MODEL_OPTIONS` entry in `model_catalog.py` — use `_CUSTOM_ONLY` if the
   provider serves many/changing models.
4. If model names are user-defined, add the provider to `_ANY_MODEL_PROVIDERS` in
   `validators.py` so `warn_if_unknown_model` stays quiet.
5. If it has wire-format quirks, subclass `NormalizedChatOpenAI` and set
   `chat_class`; declare per-model parameter quirks in `capabilities.py`.

### If it has a genuinely different API

1. Create `llm_clients/{provider}_client.py` extending `BaseLLMClient`; implement
   `get_llm()` and `validate_model()`. Wrap the chat class so `invoke()` calls
   `normalize_content`.
2. Add a lazy-import branch in `factory.py` **above** the registry check.
3. Register in `api_key_env.py`, `model_catalog.py`, and `validators.py` as above.
4. If it takes a thinking/effort knob, add a `_get_provider_kwargs()` branch in
   `graph/trading_graph.py` plus a config key and an `_ENV_OVERRIDES` row.

## Model Catalog & Validation

`model_catalog.py::MODEL_OPTIONS[provider]["quick" | "deep"]` is a list of
`(label, model_id)` pairs. It drives **both** the CLI dropdowns and
`validators.py::VALID_MODELS` (built by `get_known_models()`), so the catalog and
the validator can never drift apart.

`_ANY_MODEL_PROVIDERS` (validation skipped entirely): `ollama`, `openrouter`,
`openai_compatible`, `mistral`, `kimi`, `groq`, `nvidia`, `bedrock`.

Adding a model = one entry in `MODEL_OPTIONS`. `_CUSTOM_ONLY` is the shared
"Custom model ID only" placeholder for providers whose lists go stale.

## Validation

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

Expected output: `16 openai-compatible + 4 native`, nothing missing from
`api_key_env`, and `{'openrouter', 'azure'}` missing from `model_catalog`. Those
two absences are intentional — OpenRouter's model list is fetched dynamically and
any Azure deployment name is valid — so `get_model_options()` raises `KeyError`
for them by design. `bedrock` **is** in the catalog, mapped to `_CUSTOM_ONLY`.

A live smoke test needs a real key:
```bash
python3 -c "
from tradingagents.llm_clients import create_llm_client
llm = create_llm_client('openai', 'gpt-5.4-mini').get_llm()
print(llm.invoke('reply with OK').content)
"
```

## Additional Resources

- **`references/providers.md`** — per-client internals, normalization wrappers,
  capability rows, and how `TradingAgentsGraph` builds provider kwargs
