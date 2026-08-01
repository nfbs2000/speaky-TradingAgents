# 12장: Claude Code 팀과 스킬

이 장은 `tradingagents/` 안의 Python 멀티에이전트 파이프라인이 아니라, 이 포크의
`.claude/` 디렉터리에 들어 있는 **Claude Code 작업팀과 스킬 운영층**을 설명한다.

둘은 이름이 비슷하지만 다른 층이다. Python 파이프라인은 LangGraph node가 금융 분석을
실행하는 제품 코드이고, `.claude` 팀은 그 제품 코드를 고치고, 검증하고, 공개 해설을
운영하기 위한 Claude Code 협업 규약이다.

## 한눈에 보는 구조

| 위치 | 역할 |
|---|---|
| `.claude/TEAM.md` | 전체 팀 편성, 실행 경계, 비용 규칙, ownership rule |
| `.claude/agents/*.md` | Claude Code subagent의 역할, 담당 파일, 금지 영역, 검증 명령 |
| `.claude/skills/*/SKILL.md` | 코드베이스 사실, 반복 절차, 변경 체크리스트 |
| `.claude/skills/*/references/` | 스킬이 필요할 때만 읽는 세부 지도 |
| `.claude/skills/*/scripts/` | 평가나 upstream sync처럼 반복 가능한 작업 스크립트 |

핵심 규칙은 `TEAM.md`에 적혀 있다. **스킬은 검증된 사실을 들고 있고, 에이전트는
역할·범위·프로토콜을 들고 있다.** 그래서 specialist agent는 작업을 시작할 때 자기
영역의 skill을 먼저 읽는다.

## 두 가지 팀을 구분한다

`.claude/TEAM.md`는 팀을 크게 두 갈래로 나눈다.

| 팀 | 목적 | 산출물 | 실제 TradingAgents 파이프라인인가 |
|---|---|---|---|
| 개발·유지보수 팀 | repo의 agent, graph, dataflow, provider, memory, 평가, upstream sync를 고친다 | 코드 변경, 테스트 결과, drift report | 아니다. 파이프라인을 고치는 작업팀이다. |
| runtime stock research 팀 | Claude Code subagent와 web search로 한 종목을 빠르게 조사한다 | `output/{TICKER}/{DATE}/*.md` | 아니다. Python LangGraph 실행을 모사한 web research harness다. |
| Python pipeline | `TradingAgentsGraph.propagate()`와 CLI가 실행하는 제품 코드 | report tree, memory log, 5-tier signal | 맞다. 책 1~11장이 읽는 핵심 대상이다. |

이 구분이 중요하다. runtime stock research 팀의 `BUY/SELL/HOLD` 보고서를 Python
파이프라인의 `Buy/Overweight/Hold/Underweight/Sell` signal과 같은 값처럼 비교하면 안 된다.

## 개발·유지보수 팀

개발팀은 `ta-lead`가 작업을 쪼개고 specialist에게 넘기는 구조다. 사용자가 어느
subsystem이 문제인지 모를 때는 `ta-lead`가 먼저 들어가는 진입점이다.

| Agent | 담당 | 할 수 있는 일 |
|---|---|---|
| `ta-lead` | 팀 lead | 요청 분해, specialist dispatch, 검증 취합, 최종 합성 |
| `ta-agent-smith` | agent layer | analyst/researcher/manager/trader prompt, schema, 새 agent 생성 |
| `ta-graph-engineer` | LangGraph workflow | node/edge/routing/path map, analyst 순서, checkpoint/resume |
| `ta-data-engineer` | data tools와 vendors | `@tool`, yfinance/Alpha Vantage/FRED/Polymarket, dataflow fallback |
| `ta-llm-engineer` | provider와 model | Claude, OpenAI-compatible, Bedrock, Ollama, vLLM, retry와 model config |
| `ta-memory-engineer` | decision memory | `trading_memory.md`, reflection, realized-return/benchmark math |
| `ta-evaluator` | 실행과 측정 | 단일 run, backtest, A/B, cost estimate, report/log 분석 |
| `ta-maintainer` | fork maintenance | upstream sync, conflict review, baseline test, skill drift check |

개발팀은 파일 ownership을 강하게 나눈다. 예를 들어 새 analyst를 만들 때는 data tool이
먼저 존재해야 하고, 그 다음 prompt가 tool을 말하며, 마지막으로 graph node와 ToolNode에
연결된다. 순서가 틀리면 모델은 "data unavailable"을 말하거나 routing 단계에서 실패한다.

## runtime stock research 팀

runtime stock research 팀은 Python package를 실행하지 않는다. Claude Code subagent와
web search로 한 종목에 대한 네 개의 보고서를 만들고, 마지막에 종합한다.

| Agent | 담당 보고서 | 읽는 것 |
|---|---|---|
| `ta-market-analyst` | `01-technical-analysis.md` | 가격 추세, 지표, 지지·저항, 거래량 |
| `ta-fundamentals-analyst` | `02-fundamentals-analysis.md` | 실적, 재무상태, cash flow, valuation, 경쟁 구도 |
| `ta-news-sentiment-analyst` | `03-news-sentiment-analysis.md` | 최근 뉴스, analyst rating, social sentiment, insider/institutional activity |
| `ta-risk-trader` | `04-risk-trade-decision.md` | 앞의 세 보고서, bull/bear case, risk/reward, 최종 signal |

이 팀은 `ta-team-analysis` skill이 orchestrate한다. 기본 산출물은 다음 구조다.

```text
output/{TICKER}/{DATE}/
├── 01-technical-analysis.md
├── 02-fundamentals-analysis.md
├── 03-news-sentiment-analysis.md
├── 04-risk-trade-decision.md
└── 05-final-report.md
```

이 보고서는 빠른 조사에는 유용하지만, TradingAgents 제품 파이프라인의 structured schema,
5-tier rating parser, memory log, checkpoint와 직접 호환되지 않는다.

## 스킬 목록

스킬은 agent가 막연한 일반 지식으로 작업하지 않도록 붙인 검증된 runbook이다.

| Skill | 언제 쓰는가 | 핵심 소유 영역 |
|---|---|---|
| `ta-agent-creator` | 새 analyst, researcher, debator, structured agent를 추가할 때 | agent category, state field, node registration checklist |
| `ta-prompt-engineer` | 기존 prompt, system message, schema guidance를 바꿀 때 | report format, rating vocabulary, structured schema prompt |
| `ta-workflow-editor` | agent 순서, graph routing, debate round, checkpoint를 바꿀 때 | LangGraph node registry와 router path map |
| `ta-data-tools` | data source, vendor, tool, indicator, macro/prediction market source를 바꿀 때 | routed tool table, vendor fallback, error sentinel |
| `ta-llm-config` | provider/model/API key/retry/reasoning knob을 바꿀 때 | provider registry와 model capability |
| `ta-memory-manager` | decision memory를 읽거나 백업·회전·정리할 때 | append-only memory log, reflection lifecycle |
| `ta-eval-backtest` | single run, backtest, A/B, 결과 분석을 할 때 | `TradingAgentsGraph` 실행, signal, cost, artifact path |
| `ta-team-analysis` | Claude Code subagent로 종목 web research 팀을 돌릴 때 | 네 research agent dispatch와 report 저장 |
| `upstream-sync` | TauricResearch upstream과 포크를 동기화할 때 | protected local customization, conflict, drift check |

## 팀이 실제로 할 수 있는 일

`.claude` 팀은 다음 작업을 처리하도록 설계돼 있다.

1. 새 analyst나 data tool을 추가할 때 필요한 파일 순서를 안내한다.
2. LangGraph node 이름, router return, path map의 drift를 확인한다.
3. yfinance, Alpha Vantage, FRED, Polymarket 같은 vendor route를 안전하게 바꾼다.
4. Claude, Bedrock, OpenAI-compatible, local model provider 설정을 점검한다.
5. memory log를 백업하고 pending reflection과 realized return 경계를 구분한다.
6. 단일 평가 run이나 backtest sweep의 비용과 실패를 보고한다.
7. upstream merge 뒤 skill이 낡았는지 검사한다.
8. Python 파이프라인을 돌리지 않고도 web research 기반 임시 팀 보고서를 만든다.

반대로 다음은 하지 않는다.

- 투자 조언이나 수익 보장
- broker 주문 실행
- `.claude` web research report를 Python pipeline signal로 둔갑시키기
- API key 없이 paid pipeline을 실행한 것처럼 말하기
- skill 내용을 조용히 고쳐서 팀 전체의 사실 원장을 drift시키기

## 사용 예

다단계 코드 변경은 lead에게 맡긴다.

```text
Agent(subagent_type: "ta-lead",
      prompt: "Add an options analyst end to end and verify the graph builds")
```

소유 영역이 분명하면 specialist를 직접 부른다.

```text
Agent(subagent_type: "ta-llm-engineer",
      prompt: "Add a Cerebras OpenAI-compatible provider. REPORT_TO: main")
```

종목 web research 팀은 skill을 먼저 읽고 실행한다.

```text
Skill(ta-team-analysis)
```

## 핵심 정리

`.claude`는 TradingAgents의 제품 코드가 아니라, 이 포크를 안전하게 읽고 수정하기 위한
운영 계층이다. 개발팀은 코드 ownership과 검증을 나누고, runtime research 팀은 web 기반
보고서를 빠르게 만든다. 둘 다 책의 주제인 Python LangGraph 파이프라인을 이해하는 데
도움이 되지만, 제품 파이프라인의 실행 결과를 대체하지는 않는다.

다음 장은 이 팀을 사람이 매번 손으로 조율하지 않고, `Triage → Fix → Verify → Review`
절차로 실행하는 `.claude/workflows/ta-problem-solver.js`를 읽는다.

## 원본 자료

- [`.claude/TEAM.md`](https://github.com/nfbs2000/speaky-TradingAgents/blob/main/.claude/TEAM.md)
- [`.claude/agents/`](https://github.com/nfbs2000/speaky-TradingAgents/tree/main/.claude/agents)
- [`.claude/skills/`](https://github.com/nfbs2000/speaky-TradingAgents/tree/main/.claude/skills)
