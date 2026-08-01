---
name: ta-memory-manager
description: 사용자가 "manage memory", "reset memory", "clear agent memory", "view memories", "export memory", "import memory", "check learning history", "memory backup", "memory migration", "rotate memory log", "trading_memory.md"를 요청하거나 TradingAgents 의사결정 로그 메모리 시스템을 관리하려 할 때 이 스킬을 사용한다.
version: 0.2.0
---

# TradingAgents 메모리 매니저

TradingAgents에 학습 루프를 부여하는 append-only 마크다운 의사결정 로그를 관리한다.

> **이 포크는 upstream의 BM25 메모리 시스템을 대체했다.**
> `FinancialSituationMemory`, `rank_bm25` 의존성, 에이전트별 메모리 저장소,
> `reflect_and_remember()`는 존재하지 않는다. 문서나 프롬프트, 이슈에서 그것들을
> 언급한다면 이 설계 이전의 내용이다. 아래 "BM25 메모리에서 마이그레이션"을 참고하라.

## 메모리 아키텍처

### `TradingMemoryLog`

`tradingagents/agents/utils/memory.py`. 단일 append-only 마크다운 파일이며, 평문으로
읽을 수 있고 손으로 편집할 수 있다. 임베딩도, 인덱스도, API 호출도 없다.

- **경로**: `config["memory_log_path"]`, 기본값
  `~/.tradingagents/memory/trading_memory.md`
  (`TRADINGAGENTS_MEMORY_LOG_PATH`로 재정의)
- **인스턴스**: 정확히 하나, `TradingAgentsGraph.memory_log`
- **소비자**: 정확히 한 에이전트 — **Portfolio Manager**, `state["past_context"]`를 통해
- **엔트리 구분자**: `\n\n<!-- ENTRY_END -->\n\n` (HTML 주석이므로 LLM 산문에는
  결코 나타날 수 없다)
- **미설정 시 no-op**: `memory_log_path`가 falsy면 모든 쓰기 메서드는 조용히
  반환하고 모든 읽기는 빈 값을 돌려준다. 사실상 메모리가 꺼진 상태다.

### 엔트리 포맷

pending 엔트리(모든 실행의 끝에 기록되며, LLM 호출 없음):

```
[2026-07-24 | NVDA | Buy | pending]

DECISION:
**Rating**: Buy

**Executive Summary**: ...
```

결과가 해소된 뒤의 같은 엔트리:

```
[2026-07-24 | NVDA | Buy | +6.2% | +2.1% | 5d]

DECISION:
**Rating**: Buy
...

REFLECTION:
The directional call was correct, with +2.1% alpha vs SPY. ...
```

태그 필드: `date | ticker | rating | raw_return | alpha_return | holding_days`,
또는 `date | ticker | rating | pending`. `rating`은 5단계 척도
(Buy / Overweight / Hold / Underweight / Sell) 중 하나이며
`rating.parse_rating()`이 추출한다.

### 2단계 라이프사이클

**Phase A — 쓰기 (모든 `propagate()`의 끝)**
```python
self.memory_log.store_decision(ticker, trade_date, final_state["final_trade_decision"])
```
`| pending]` 엔트리를 추가한다. 멱등적이다. 빠른 원문 스캔으로 동일한
`(trade_date, ticker)`의 pending 엔트리가 이미 있으면 추가를 건너뛴다. LLM 호출도,
네트워크도 없다.

**Phase B — 해소 (*다음* 동일 티커 `propagate()`의 시작)**
```python
self._resolve_pending_entries(company_name)   # propagate()에서 가장 먼저 호출됨
```
**해당 티커의** 각 pending 엔트리에 대해:
1. `_fetch_returns()`가 yfinance에서 그 티커와 벤치마크의 5거래일치 가격을 가져와
   (주말/휴장일을 위해 달력 기준 7일 버퍼 사용) `raw`와
   `alpha = raw - benchmark_return`을 계산한다.
2. 가격 데이터가 아직 없으면(너무 최근, 상장폐지, 네트워크 오류) 건너뛴다 —
   이후 실행에서 재시도한다.
3. `Reflector.reflect_on_final_decision()`이 2~4문장 리플렉션을 생성한다
   (해소된 엔트리당 LLM 호출 1회).
4. 모든 갱신은 **한 번의** `batch_update_with_outcomes()` 호출로 적용된다 —
   단일 읽기 + 단일 원자적 쓰기.

알아둘 만한 귀결: **다른 티커의 엔트리는 그 티커를 다시 분석할 때까지 pending 상태로
쌓인다.** 이는 의도된 트레이드오프다(해소되는 엔트리당 벤치마크 조회 1회와 LLM 호출
1회를, 사용자가 이미 작업 중인 대상에 대해서만 수행한다).

### 읽기 경로

```python
past_context = self.memory_log.get_past_context(company_name)   # n_same=5, n_cross=3
```
실행당 한 번 `_run_graph()`에서 호출되어 `state["past_context"]`로 주입된다.
**해소된** 엔트리만 반환한다(pending은 학습할 결과가 없다):

- 가장 최근 동일 티커 엔트리 최대 5개, **전문**(태그 + DECISION + REFLECTION)
- 가장 최근 다른 티커 엔트리 최대 3개, **리플렉션만**(리플렉션이 없으면 decision의
  앞 300자)

로그가 비었거나 미설정이면 `""`를 반환하며, 이 경우 Portfolio Manager의 프롬프트는
교훈 블록을 아예 생략한다.

### 벤치마크 결정

`TradingAgentsGraph._resolve_benchmark(ticker)`:
1. `config["benchmark_ticker"]`가 설정되어 있으면 무조건 우선한다
   (`TRADINGAGENTS_BENCHMARK_TICKER`).
2. 그렇지 않으면 `config["benchmark_map"]`이 거래소 접미사를 매칭한다 —
   `.NS`→`^NSEI`, `.BO`→`^BSESN`, `.T`→`^N225`, `.HK`→`^HSI`, `.L`→`^FTSE`,
   `.TO`→`^GSPTSE`, `.AX`→`^AXJO`, `.SS`→`000001.SS`, `.SZ`→`399001.SZ`.
3. 폴백은 빈 접미사 항목인 `SPY`다. 점이 포함된 미국 티커
   (예: `BRK.B`)도 여기에 해당하며, 알파 계산이 USD 기준이므로 올바른 동작이다.

결정된 벤치마크 이름은 리플렉션 프롬프트로 전달되므로, 도쿄 상장 종목이면 저장된
리플렉션이 항상 "SPY"가 아니라 "alpha vs ^N225"로 읽힌다.

## 주요 작업

### 로그 보기
```bash
cat "${TRADINGAGENTS_MEMORY_LOG_PATH:-$HOME/.tradingagents/memory/trading_memory.md}"
```

### 파싱된 엔트리 확인
```python
from tradingagents.agents.utils.memory import TradingMemoryLog
from tradingagents.default_config import DEFAULT_CONFIG

log = TradingMemoryLog(DEFAULT_CONFIG)
entries = log.load_entries()
print(f"{len(entries)} entries, {len(log.get_pending_entries())} pending")
for e in entries[-3:]:
    print(e["date"], e["ticker"], e["rating"],
          "pending" if e["pending"] else f"{e['raw']} / {e['alpha']} / {e['holding']}")
```

파싱된 각 엔트리는 dict다: `date`, `ticker`, `rating`, `pending`(bool),
`raw`, `alpha`, `holding`(문자열 또는 `None`), `decision`, `reflection`.

### Portfolio Manager가 보게 될 내용 미리 보기
```python
print(log.get_past_context("NVDA"))
print(log.get_past_context("NVDA", n_same=10, n_cross=0))   # 윈도 조정
```

### 메모리 삭제
`clear()` 메서드는 없다 — 로그는 파일이다:
```bash
rm ~/.tradingagents/memory/trading_memory.md          # 완전 삭제
mv ~/.tradingagents/memory/trading_memory.md{,.bak}   # 보관
```
삭제해도 안전하다. `TradingMemoryLog.__init__`이 상위 디렉터리를 다시 만들고,
`store_decision`이 다음 실행에서 파일을 생성한다.

### 백업 / 복원
```bash
cp ~/.tradingagents/memory/trading_memory.md ./trading_memory.$(date +%Y%m%d).md
```
평범한 마크다운이므로 복사, diff, `git` 추적, 수동 편집이 가능하다.
`<!-- ENTRY_END -->` 구분자와 `[...]` 태그 줄 포맷을 반드시 보존하라. 그러지 않으면
`_parse_entry()`가 엔트리를 조용히 건너뛴다(첫 줄이 대괄호로 감싸여 있고 파이프로
구분된 필드가 최소 4개여야 한다).

### 수동으로 메모리 심기
해소된 엔트리를 직접 추가한다:
```
[2026-01-15 | AAPL | Hold | +0.4% | -1.2% | 5d]

DECISION:
**Rating**: Hold

REFLECTION:
Sitting out was roughly right on direction but cost 1.2% of alpha against SPY.
The thesis under-weighted the services-margin story. Next time, weight recurring
revenue trend above the hardware cycle read.

<!-- ENTRY_END -->

```

### 로그 증가 상한
```python
"memory_log_max_entries": 200,   # None (기본값)이면 로테이션 비활성화
```
`_apply_rotation()`은 결과 갱신마다 실행되며, 해소된 엔트리 수가 상한을 넘으면
**가장 오래된 해소 엔트리**부터 버린다. **pending 엔트리는 절대 제거되지 않는다** —
아직 처리되지 않은 작업을 나타내기 때문이다. 로테이션은 추가 경로에서는 절대 실행되지
않고 갱신 시에만 실행되므로, 해소가 전혀 없는 로그는 이 설정과 무관하게 무한히 커진다.

### pending 엔트리 강제 해소
리플렉션은 설계상 지연 실행되며 이를 위한 CLI 명령은 없다. 해당 티커를 다시 실행해
트리거하거나, 직접 구동한다:
```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
g = TradingAgentsGraph()
g._resolve_pending_entries("NVDA")   # API 키 + 네트워크 필요
```

## 내구성

`update_with_outcome()`과 `batch_update_with_outcomes()`는 `<log>.tmp`에 쓴 뒤
대상 파일로 `Path.replace()` 하므로, 쓰기 도중 크래시가 나도 로그가 손상되지 않는다.
`store_decision()`은 평범한 `open(..., "a")` 추가를 사용한다. 원리상 부분 추가가
가능하지만, `<!-- ENTRY_END -->` 종료자가 없는 엔트리는 그냥 마지막 블록으로 파싱된다.

## BM25 메모리에서 마이그레이션

upstream 메모리 시스템을 전제로 작성된 코드나 문서를 이식하는 경우:

| Upstream (BM25) | 이 포크 |
|---|---|
| `FinancialSituationMemory(name, config)` | `TradingMemoryLog(config)` — 5개가 아니라 인스턴스 1개 |
| `bull_memory`, `bear_memory`, `trader_memory`, `invest_judge_memory`, `risk_manager_memory` | 없음. Portfolio Manager만 메모리를 읽는다 |
| `memory.get_memories(situation, n_matches=2)` | `log.get_past_context(ticker, n_same=5, n_cross=3)` |
| `memory.add_situations([(sit, rec)])` | `log.store_decision(ticker, date, decision)` (pending) |
| `memory.clear()` | 로그 파일 삭제 |
| `graph.reflect_and_remember(returns)` | 다음 동일 티커 실행에서 자동 Phase B |
| `create_bull_researcher(llm, memory)` | `create_bull_researcher(llm)` — memory 인자 없음 |
| `Reflector.reflect_bull_researcher(...)` 등 | `Reflector.reflect_on_final_decision(...)`만 존재 |
| 유사도 검색(어휘 매칭) | 최신순 + 티커 일치(스코어링 없음) |

`main.py`에는 여전히 주석 처리된 `ta.reflect_and_remember(1000)` 줄이 남아 있다.
이는 낡은 코드이며 살아 있는 API가 아니다.

## 수정할 파일

| 작업 | 파일 |
|-----------|------|
| 로그 포맷, 파싱, 로테이션 | `tradingagents/agents/utils/memory.py` |
| 리플렉션 프롬프트 / 출력 형태 | `tradingagents/graph/reflection.py` |
| Phase B 오케스트레이션, 수익률 및 벤치마크 조회 | `tradingagents/graph/trading_graph.py` (`_resolve_pending_entries`, `_fetch_returns`, `_resolve_benchmark`) |
| 상태로의 컨텍스트 주입 | `tradingagents/graph/trading_graph.py` (`_run_graph`) + `graph/propagation.py` |
| `past_context`를 읽는 에이전트 | `tradingagents/agents/managers/portfolio_manager.py` |
| 태그의 등급 어휘 | `tradingagents/agents/utils/rating.py` |
| 경로 / 로테이션 설정 | `tradingagents/default_config.py` |

## 검증

```bash
pytest tests/test_memory_log.py -q
```

## 추가 자료

- **`references/memory_internals.md`** — 전체 클래스 API, 파싱 규칙, 로테이션
  시맨틱, 리플렉션 프롬프트 계약
