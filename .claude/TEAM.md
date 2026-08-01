# TradingAgents 팀

에이전트 정의는 `.claude/agents/`에, 에이전트가 로드하는 지식은
`.claude/skills/`에 있다. **스킬은 코드베이스에 대한 검증된 사실을, 에이전트는
역할·범위·프로토콜을 담는다.** 각 에이전트의 첫 동작은 자기 스킬을 로드하는 것이므로,
사실은 정확히 한 곳에만 존재한다.

## 구성

리드를 띄워서 배정을 맡기거나, 담당자를 이미 아는 경우 스페셜리스트를 바로 띄운다.

```
ta-lead  ── 팀 리드: 분해, 배정, 검증, 종합
│
├── 개발 / 유지보수
│   ├── ta-agent-smith        에이전트, 프롬프트, 스키마          → ta-agent-creator, ta-prompt-engineer
│   ├── ta-graph-engineer     LangGraph 노드 & 라우팅             → ta-workflow-editor
│   ├── ta-data-engineer      툴, 벤더, 데이터플로우              → ta-data-tools
│   ├── ta-llm-engineer       프로바이더, 모델, kwargs            → ta-llm-config
│   ├── ta-memory-engineer    의사결정 로그, 리플렉션             → ta-memory-manager
│   ├── ta-evaluator          실행, 백테스트, A/B                 → ta-eval-backtest
│   └── ta-maintainer         업스트림 싱크, 드리프트, 베이스라인 → upstream-sync
│
└── 런타임 종목 리서치    (ta-team-analysis 스킬이 오케스트레이션)
    ├── ta-market-analyst           → output/{T}/{D}/01-technical-analysis.md
    ├── ta-fundamentals-analyst     → output/{T}/{D}/02-fundamentals-analysis.md
    ├── ta-news-sentiment-analyst   → output/{T}/{D}/03-news-sentiment-analysis.md
    └── ta-risk-trader              → output/{T}/{D}/04-risk-trade-decision.md
```

12개 모두 `model: inherit`를 쓴다 — 세션의 모델로 실행된다. 특정 역할에 모델 티어를
고정하려면 해당 정의의 frontmatter에 `model:` 또는 `effort:`를 추가한다.

## "분석"이라는 이름의 서로 다른 두 가지

이 둘을 구분해라. 뒤섞으면 비교 가능해 보이지만 실제로는 그렇지 않은 숫자가 나온다.

| | Python 파이프라인 | 런타임 리서치 팀 |
|---|---|---|
| 주체 | `ta-evaluator`, 또는 `tradingagents analyze` | `ta-market-analyst` … `ta-risk-trader` |
| 엔진 | `tradingagents/`의 12-에이전트 LangGraph | Claude Code 서브에이전트 + 웹 검색 |
| 데이터 | yfinance / Alpha Vantage / FRED / Polymarket | 실시간 웹 페이지 |
| 시그널 | 5단계 `Buy/Overweight/Hold/Underweight/Sell`, `**Rating**:`에서 파싱 | `BUY/SELL/HOLD` 서술문 |
| 필요 조건 | 프로바이더 API 키, `pip install -e .` | 둘 다 불필요 |
| 산출물 | `~/.tradingagents/logs/…json`, 리포트 트리, 메모리 로그 항목 | `output/{TICKER}/{DATE}/*.md` |

## 사용법

```
# 리드 주도, 여러 부분으로 나뉜 작업
Agent(subagent_type: "ta-lead", prompt: "Switch to Anthropic and re-verify the graph builds")

# 담당자에게 바로
Agent(subagent_type: "ta-llm-engineer", prompt: "Add the Cerebras OpenAI-compatible provider")

# 종목 리서치
Skill(ta-team-analysis)     # 이후 해당 스킬의 오케스트레이션을 따른다

# 문제 해결 (버그 / 실패 테스트 / 리그레션) — 결정적인 진단→수정→검증 루프
Workflow(name: "ta-problem-solver", args: {problem: "<what is broken>", repro: "<optional command>"})
```

스페셜리스트를 직접 배정할 때는 작업 범위, 건드려도 되는 파일, 건드리면 안 되는 것,
그리고 `REPORT_TO: main`을 함께 준다.

## 공통 환경 계약

모든 에이전트 정의가 이 세 가지를 반복해 명시한다. 모든 검증의 전제이기 때문이다.

- **`python3`**를 사용해라 — 이 머신에는 `python` shim이 없다.
- `import tradingagents.graph.*`가 `yfinance`에서 실패하면 먼저 `pip install -e ".[dev]"`를
  실행해라 (venv를 써도 된다).
- 테스트 베이스라인: **576 passed, 2 skipped** (2026-07-31, 커밋 `a33fd4c`). 스킵되는 것은
  `test_bedrock_provider.py` (`langchain_aws` 없음)와 `test_deepseek_reasoning.py`
  (`DEEPSEEK_API_KEY` 없음)이다. `ruff check .`는 깨끗하게 통과한다.

환경이 바뀌면 이 파일 **그리고** 영향받는 각 에이전트의 Environment/Validation 섹션을
함께 갱신해라.

## 비용 경계

- 유료 파이프라인을 실행하는 에이전트는 `ta-evaluator`뿐이다. 스윕 전에 호출 횟수를
  추정하고 승인을 받아야 하며, 실제 비용을 보고해야 한다.
- `ta-llm-engineer`와 `ta-data-engineer`는 실제 API 호출이 아니라 테스트로 검증한다.
- 리서치 에이전트 4종은 LLM 프로바이더 쿼터가 아니라 웹 검색을 소비한다.

## 충돌을 막는 소유권 규칙

- 툴은 **존재하고 라우팅되어야** (`ta-data-engineer`) 하고, 그다음 **ToolNode에 바인딩**
  (`ta-graph-engineer`)되어야 하며, 그다음에야 **프롬프트가 그것을 지칭**(`ta-agent-smith`)할 수 있다.
  순서가 어긋나면 실행 시점에 "data unavailable"로 실패한다.
- 새 애널리스트 추가는 병렬 작업이 아니라 4단계 순차 작업이다:
  `ta-data-engineer → ta-agent-smith → ta-graph-engineer → ta-evaluator`.
- 레이팅 어휘는 `rating.py`, `schemas.py`, `signal_processing.py`에 걸쳐 있다 — 담당자는
  한 명(`ta-agent-smith`)이며, 절대 나누지 않는다.
- 업스트림 머지 이후의 작업은 `ta-maintainer`의 드리프트 체크로 시작한다. 스킬이 문서화한
  내부 구조를 머지가 무효화할 수 있기 때문이다.
- 기능 작업 중에는 어떤 에이전트도 `.claude/skills/`를 수정하지 않는다. 스킬 드리프트는
  조용히 패치하는 게 아니라 사용자에게 **보고**한다 — 틀린 스킬은 팀 전체를 오도한다.

## 유지보수

`ta-maintainer`가 머지 후 드리프트 체크를 담당한다 (베이스라인: 그래프 노드 20개, 라우팅되는
툴 11개, OpenAI 호환 프로바이더 16개, `TradingMemoryLog` 존재 /
`FinancialSituationMemory` 부재). 이 수치가 달라졌다면 해당 스킬은 낡은 것이고, 그 위에
올라간 에이전트들은 자신 있게 틀린 답을 내놓게 된다.
