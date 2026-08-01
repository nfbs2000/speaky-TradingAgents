# 소스 지도와 출처

## 분석 기준

- 한국어 해설 저장소: [nfbs2000/speaky-TradingAgents](https://github.com/nfbs2000/speaky-TradingAgents)
- 원 프로젝트: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- 고정 커밋: [`a33fd4c0`](https://github.com/nfbs2000/speaky-TradingAgents/tree/a33fd4c0f134485a43553a2c23a63cb14adbd88f)
- package version: `0.3.1`
- 라이선스: [Apache License 2.0](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/LICENSE)
- 논문: [TradingAgents: Multi-Agents LLM Financial Trading Framework](https://arxiv.org/abs/2412.20138)

이 사이트는 원본 코드와 문서를 대체하지 않는다. 소스 구조를 한국어 학습 순서로 다시
설명하며, 그림은 원 프로젝트가 저장소에 포함한 자산을 사용한다.

## 기능별 진입점

| 궁금한 것 | 먼저 볼 파일 | 함께 볼 파일 |
|---|---|---|
| 전체 lifecycle | [`trading_graph.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/trading_graph.py) | `propagation.py`, `signal_processing.py` |
| graph node와 edge | [`setup.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/setup.py) | `conditional_logic.py` |
| 공유 state | [`agent_states.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/agent_states.py) | `schemas.py` |
| analyst 순서 | [`analyst_execution.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/analyst_execution.py) | `setup.py` |
| 시장 grounding | [`market_analyst.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/market_analyst.py) | `market_data_validator.py` |
| 심리 source | [`sentiment_analyst.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/analysts/sentiment_analyst.py) | `reddit.py`, `stocktwits.py` |
| 강세·약세 토론 | [`bull_researcher.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/researchers/bull_researcher.py) | `bear_researcher.py` |
| 최종 판단 | [`portfolio_manager.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/managers/portfolio_manager.py) | `trader.py`, `risk_mgmt/` |
| vendor routing | [`interface.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/dataflows/interface.py) | `config.py`, `errors.py` |
| model routing | [`factory.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/llm_clients/factory.py) | `model_catalog.py`, `capabilities.py` |
| schema fallback | [`structured.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/structured.py) | `schemas.py` |
| 장기 decision memory | [`memory.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/agents/utils/memory.py) | `reflection.py` |
| 중단 재개 | [`checkpointer.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/graph/checkpointer.py) | `trading_graph.py` |
| 사람이 읽는 결과 | [`reporting.py`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/reporting.py) | CLI `stats_handler.py` |
| Claude Code 팀과 스킬 | [12장: Claude Code 팀과 스킬](part5/ch12-claude-team-skills.md) | [`.claude/TEAM.md`](https://github.com/nfbs2000/speaky-TradingAgents/blob/main/.claude/TEAM.md), [`.claude/agents/`](https://github.com/nfbs2000/speaky-TradingAgents/tree/main/.claude/agents), [`.claude/skills/`](https://github.com/nfbs2000/speaky-TradingAgents/tree/main/.claude/skills) |

## 장별 핵심 문장

| 장 | 한 문장 |
|---|---|
| 1 | 현실의 trading firm 역할을 고정된 LangGraph workflow로 옮겼다. |
| 2 | 한 실행은 identity, analyst tool loop, 토론, 최종 판단, 저장을 순서대로 통과한다. |
| 3 | agent 협업의 실체는 공유 typed state와 conditional edge다. |
| 4 | 역할의 의미는 사용할 수 있는 데이터와 남겨야 할 report에서 생긴다. |
| 5 | Bull/Bear는 같은 evidence를 반대 thesis로 읽고 manager가 계획으로 압축한다. |
| 6 | 거래 방향과 위험 수용 여부를 별도 토론으로 나눈다. |
| 7 | vendor fallback은 명시된 chain 안에서만 일어나며 데이터 부재를 숨기지 않는다. |
| 8 | provider adapter는 호출을 묶지만 모델 행동을 같게 만들지는 않는다. |
| 9 | decision memory는 장기 문맥이고 checkpoint는 중단 복구다. |
| 10 | CLI와 API는 같은 graph를 쓰며 역할별 Markdown 보고서를 남긴다. |
| 11 | 이 프레임워크는 구조화된 연구 도구이지 수익이나 실제 주문을 보장하지 않는다. |
| 12 | `.claude` 팀과 스킬은 제품 파이프라인이 아니라 포크를 읽고 고치고 검증하는 운영층이다. |

## 라이선스와 번역 범위

원 프로젝트는 Apache-2.0으로 공개돼 있다. 이 한국어 해설은 구조와 의미를 설명하기 위해
짧은 identifier와 작은 code shape를 인용하고 원본 파일을 직접 연결한다. 원본 source,
저자, 논문과 라이선스 표시는 그대로 보존한다.

모델과 provider 목록은 시간이 지나면 달라질 수 있다. 새 release를 읽을 때는
`CHANGELOG.md`, `pyproject.toml`, `default_config.py`, `model_catalog.py`를 먼저 비교한다.
