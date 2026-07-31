# 10장: CLI, 패키지 API, 보고서

## 같은 graph를 두 표면에서 사용한다

TradingAgents의 제품 표면은 크게 interactive CLI와 Python package API다. 둘 다
`TradingAgentsGraph`를 사용한다.

### CLI

```bash
tradingagents
python -m cli.main
```

사용자는 ticker, 날짜, analyst, provider, quick/deep model, debate 깊이와 출력 언어를 고른다.
Typer가 command를 정의하고 Rich와 questionary가 terminal UI를 만든다.

![TradingAgents CLI 시작 화면](../assets/cli-init.png)

### Python API

```python
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

config = DEFAULT_CONFIG.copy()
config["llm_provider"] = "anthropic"
config["output_language"] = "Korean"

graph = TradingAgentsGraph(config=config)
state, decision = graph.propagate("NVDA", "2026-01-15")
report = graph.save_reports(state, "NVDA")
```

이 예제는 구조를 보여 주기 위한 것이며 실제 실행에는 provider key와 data source의 network
접근이 필요하다.

## 설정 우선순위

기본값은 `DEFAULT_CONFIG`에 있다. `TRADINGAGENTS_*` 환경 변수는 같은 config key를 덮어쓴다.
boolean, int, float는 기존 default type을 기준으로 변환하고 잘못된 값은 startup에서
실패한다.

대표 환경 변수는 다음과 같다.

- `TRADINGAGENTS_LLM_PROVIDER`
- `TRADINGAGENTS_DEEP_THINK_LLM`
- `TRADINGAGENTS_QUICK_THINK_LLM`
- `TRADINGAGENTS_OUTPUT_LANGUAGE`
- `TRADINGAGENTS_MAX_DEBATE_ROUNDS`
- `TRADINGAGENTS_MAX_RISK_ROUNDS`
- `TRADINGAGENTS_CHECKPOINT_ENABLED`
- `TRADINGAGENTS_TEMPERATURE`
- `TRADINGAGENTS_LLM_MAX_RETRIES`

잘못 쓴 `treu`를 false로 조용히 처리하지 않고 정확한 오류를 내는 것이 unattended run에서
중요하다.

## 보고서 tree

`write_report_tree()`는 CLI와 package API가 함께 사용한다.

```text
reports/<run>/
├── 1_analysts/
│   ├── market.md
│   ├── sentiment.md
│   ├── news.md
│   └── fundamentals.md
├── 2_research/
│   ├── bull.md
│   ├── bear.md
│   └── manager.md
├── 3_trading/
│   └── trader.md
├── 4_risk/
│   ├── aggressive.md
│   ├── conservative.md
│   └── neutral.md
├── 5_portfolio/
│   └── decision.md
└── complete_report.md
```

한 파일의 최종 답만 저장하지 않고 조직의 각 단계 산출물을 남긴다. 이는 어느 역할이 어떤
판단을 추가했는지 사람이 읽는 데 유리하다.

## final state JSON과 report tree의 차이

| 산출물 | 장점 | 주의점 |
|---|---|---|
| full state JSON | field와 history 구조 보존 | 사람이 읽기 길고 내부 state에 가까움 |
| Markdown tree | 역할별 검토와 공유가 쉬움 | node execution metadata는 없음 |
| complete report | 한 문서로 전체 결론 확인 | 중간 tool call은 보이지 않음 |
| memory log | 여러 실행 사이의 결과·반성 연결 | 현재 run 전체 transcript가 아님 |

보고서가 있다는 사실은 tool call이 모두 성공했다는 observability 증거가 아니다. tool
latency, retry, provider raw response를 연구하려면 별도 callback이나 tracing이 필요하다.

## Docker 표면

Dockerfile과 `docker-compose.yml`은 CLI 실행 환경을 격리한다. Ollama profile도 제공한다.
그러나 container를 쓴다고 API key, 외부 vendor rate limit, live data 변동이 사라지지는
않는다.

## 출력 언어

`output_language`는 analyst report와 최종 결정에 language instruction을 넣는다. 내부 토론
품질을 위해 일부 prompt 구조와 label은 영어 contract를 유지한다. speaker prefix가 router에
쓰이는 구간이 있으므로 단순 번역은 control flow에도 영향을 줄 수 있다.

## 핵심 정리

- CLI와 Python API는 같은 `TradingAgentsGraph`를 사용한다.
- 환경 변수 override는 type 오류를 조용히 삼키지 않는다.
- report tree는 역할별 산출물을 보존하지만 raw 실행 trace는 아니다.
- Docker는 실행 환경을 묶을 뿐 외부 데이터와 모델의 불확실성을 제거하지 않는다.
- 출력 언어와 내부 routing label은 같은 문제가 아니다.

## 원본 소스

- [`CLI entry`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/cli/main.py)
- [`CLI config`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/cli/config.py)
- [`default config`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/default_config.py)
- [`report writer`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/tradingagents/reporting.py)
- [`Docker Compose`](https://github.com/nfbs2000/speaky-TradingAgents/blob/a33fd4c0f134485a43553a2c23a63cb14adbd88f/docker-compose.yml)
