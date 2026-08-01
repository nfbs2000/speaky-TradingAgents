# 메모리 시스템 내부 구조

## `TradingMemoryLog` API

```python
class TradingMemoryLog:
    _SEPARATOR    = "\n\n<!-- ENTRY_END -->\n\n"
    _DECISION_RE   = re.compile(r"DECISION:\n(.*?)(?=\nREFLECTION:|\Z)", re.DOTALL)
    _REFLECTION_RE = re.compile(r"REFLECTION:\n(.*?)$", re.DOTALL)

    def __init__(self, config: dict = None)

    # 쓰기 (Phase A)
    def store_decision(ticker: str, trade_date: str, final_trade_decision: str) -> None

    # 읽기
    def load_entries() -> list[dict]
    def get_pending_entries() -> list[dict]
    def get_past_context(ticker: str, n_same: int = 5, n_cross: int = 3) -> str

    # 갱신 (Phase B)
    def update_with_outcome(ticker, trade_date, raw_return, alpha_return,
                            holding_days, reflection) -> None
    def batch_update_with_outcomes(updates: list[dict]) -> None

    # 헬퍼 (비공개)
    def _apply_rotation(blocks: list[str]) -> list[str]
    def _parse_entry(raw: str) -> dict | None
    def _format_full(e: dict) -> str
    def _format_reflection_only(e: dict) -> str
```

`__init__`은 설정 키 두 개만 읽고 그 외에는 아무것도 읽지 않는다:

```python
path = config.get("memory_log_path")
if path:
    self._log_path = Path(path).expanduser()
    self._log_path.parent.mkdir(parents=True, exist_ok=True)
self._max_entries = config.get("memory_log_max_entries")
```

`self._log_path is None`이면 ⇒ 모든 메서드가 no-op이거나 빈 값을 반환한다. 이것이
"메모리 비활성화" 상태이며, 오류가 아니다.

## 파싱 규칙

`load_entries()`는 파일 전체를 `_SEPARATOR`로 분할하고, 각 블록을 strip하고, 빈 것을
버린 뒤 나머지에 `_parse_entry()`를 실행한다. 다음의 경우 블록을 건너뛴다(`None` 반환):

- 비어 있거나,
- 첫 줄이 `[`로 시작하면서 `]`로 끝나지 않거나,
- 태그 줄의 파이프 구분 필드가 4개 미만인 경우.

`[f0 | f1 | f2 | f3 | f4 | f5]`의 필드 매핑:

| 필드 | 키 | 비고 |
|-------|-----|-------|
| f0 | `date` | `YYYY-MM-DD` |
| f1 | `ticker` | `propagate()`에 전달된 그대로 |
| f2 | `rating` | `parse_rating()`이 낸 5단계 레이블 |
| f3 | `pending` | 문자열이 정확히 `pending`일 때만 `True` |
| f3 | `raw` | 같은 필드를 raw 수익률로 다시 읽은 값. pending이면 `None` |
| f4 | `alpha` | 없으면 `None` |
| f5 | `holding` | 예: `5d`. 없으면 `None` |

본문 파싱: `decision`은 `DECISION:\n` 이후부터 `\nREFLECTION:`(또는 블록 끝)까지
전부이고, `reflection`은 `REFLECTION:\n` 이후 전부다. 둘 다 기본값은 `""`.

**수동 편집 시 함의**: 리터럴 헤더 `DECISION:`과 `REFLECTION:`은 각각 독립된 줄에
있어야 하며, 바로 다음 줄에 내용이 이어져야 한다. 들여쓰기를 하거나 콜론 뒤에 빈 줄을
넣으면 정규식이 깨져 해당 필드가 조용히 비게 된다.

## 추가 시 멱등성 가드

`store_decision()`은 전체 파싱 대신 원문 파일의 줄 접두사 스캔을 수행한다:

```python
for line in raw.splitlines():
    if line.startswith(f"[{trade_date} | {ticker} |") and line.endswith("| pending]"):
        return
```

따라서 같은 티커+날짜를 다시 실행해도 pending 엔트리가 중복되지 않는다. 다만 그
엔트리가 일단 **해소되면**(더 이상 `| pending]`으로 끝나지 않으면) 재실행 시 같은
날짜에 대해 새 pending 엔트리가 추가된다. 이미 해소된 날짜를 반복 재실행하면 그만큼
엔트리가 쌓인다.

## 갱신 시맨틱

두 갱신 메서드 모두:

1. 파일 전체를 읽고 `_SEPARATOR`로 분할한다.
2. 각 블록에 대해 `lines[0].strip()`을
   `f"[{trade_date} | {ticker} |"`(접두사) 및 `"| pending]"`(접미사)와 비교한다.
3. 일치하면 `fields[2]`에서 등급을 다시 파싱해 해소된 태그를 만들고,
   `\n\nREFLECTION:\n{reflection}`을 덧붙인다.
4. 로테이션을 적용하고 합친 뒤 `<log>.tmp`에 쓰고, 로그 파일로 `Path.replace()` 한다.

차이점:

- `update_with_outcome()`은 일치하는 **첫 번째** pending 엔트리만 갱신하며
  (`if not updated and ...`), 일치하는 것이 없으면 아무것도 쓰지 않고 반환한다.
- `batch_update_with_outcomes()`는 `{(trade_date, ticker): update}` 맵을 만들고 각
  키를 첫 일치에서 소비하므로(`del update_map[...]`), 각 갱신은 정확히 한 블록에만
  적용된다. 일부 갱신이 일치하지 않아도 파일을 쓴다. 갱신 dict마다 필요한 키:
  `ticker`, `trade_date`, `raw_return`, `alpha_return`,
  `holding_days`, `reflection`.

수익률 포맷은 `f"{value:+.1%}"`이므로 `0.062`는 `+6.2%`로 렌더링된다. 퍼센트가 아니라
**분수**를 전달하라: `6.2`가 아니라 `0.062`.

## 로테이션 시맨틱

```python
def _apply_rotation(self, blocks):
    if not self._max_entries or self._max_entries <= 0:
        return blocks                       # 비활성화
    # 각 블록 분류: 태그 줄이 대괄호로 감싸여 있고 "| pending]"이 아니면 해소된 것
    if resolved_count <= self._max_entries:
        return blocks
    # 가장 오래된 해소 블록 `resolved_count - max_entries`개를 버린다
```

- 두 갱신 메서드에서**만** 실행되며, `store_decision()`에서는 절대 실행되지 않는다.
- pending 블록은 항상 유지된다.
- 공백만 있는 블록은 미해소로 분류되어 보존된다.

## 리플렉션 프롬프트 계약

`Reflector._get_log_reflection_prompt()`가 문자 그대로 요구하는 것:

- 정확히 2~4문장의 평문 산문. 불릿/헤더/마크다운 금지
- 순서대로: (1) 방향성 판단이 맞았는지, 알파 수치를 인용할 것,
  (2) 논리 중 어느 부분이 맞고 어느 부분이 틀렸는지, (3) 구체적인 교훈 하나

human 메시지는 다음을 제공한다:
```
Raw return: {raw_return:+.1%}
Alpha vs {benchmark_name}: {alpha_return:+.1%}

Final Decision:
{final_decision}
```

출력이 그대로 저장되어 이후 Portfolio Manager 프롬프트에 다시 주입되므로, 여기서
길이 제한을 느슨하게 하면 이후 모든 실행의 컨텍스트가 곧바로 부풀어 오른다.

## 수익률 및 알파 계산

`TradingAgentsGraph._fetch_returns(ticker, trade_date, holding_days=5, benchmark="SPY")`:

```python
start = datetime.strptime(trade_date, "%Y-%m-%d")
end   = start + timedelta(days=holding_days + 7)     # 주말/휴장일 버퍼
stock = yf.Ticker(normalize_symbol(ticker)).history(start=trade_date, end=end_str)
bench = yf.Ticker(benchmark).history(start=trade_date, end=end_str)
if len(stock) < 2 or len(bench) < 2:
    return None, None, None
actual_days = min(holding_days, len(stock) - 1, len(bench) - 1)
raw   = (stock.Close[actual_days] - stock.Close[0]) / stock.Close[0]
alpha = raw - (bench.Close[actual_days] - bench.Close[0]) / bench.Close[0]
```

- 티커는 `dataflows.symbol_utils.normalize_symbol()`을 거치므로 실현 수익률 조회가
  분석에서 가격을 매긴 것과 동일한 종목에 적중한다
  (예: `XAUUSD` → `GC=F`, upstream #984). 벤치마크는 이미 정규 형식이다.
- `actual_days`는 현재 시점에 가깝거나 휴장일 근처에서 **5보다 작아질 수 있다**.
  `Nd` 태그 필드에 저장되는 값은 실제 값이다.
- 모든 예외는 포착되어 WARNING("will retry next run")으로 로깅되고
  `(None, None, None)`을 반환하므로 엔트리는 pending 상태로 남는다.

## Phase B 오케스트레이션

```python
def _resolve_pending_entries(self, ticker):
    pending = [e for e in self.memory_log.get_pending_entries() if e["ticker"] == ticker]
    if not pending:
        return
    benchmark = self._resolve_benchmark(ticker)
    updates = []
    for entry in pending:
        raw, alpha, days = self._fetch_returns(ticker, entry["date"], benchmark=benchmark)
        if raw is None:
            continue                       # 이후 실행에서 재시도
        reflection = self.reflector.reflect_on_final_decision(
            final_decision=entry.get("decision", ""),
            raw_return=raw, alpha_return=alpha, benchmark_name=benchmark,
        )
        updates.append({...})
    if updates:
        self.memory_log.batch_update_with_outcomes(updates)
```

`propagate()`의 **첫 문장**으로 호출되며, 체크포인터가 설정되기 전이자 그래프가 돌기
전이다. 따라서 모든 실행은 새 결정을 내기 전에 항상 이전 결과로부터 학습한다.

실행당 비용: yfinance history 한 쌍 + **해당 티커에 한해** 해소 가능한 pending 엔트리당
quick-LLM 호출 1회.

## 두 번째 메모리 소비자 추가하기

다른 에이전트가 `past_context`를 볼 수 있게 하려면:

1. 이미 `AgentState`에 있고(`past_context`)
   `Propagator.create_initial_state()`가 설정한다 — 상태 변경은 필요 없다.
2. 에이전트 노드에서 읽는다: `past_context = state.get("past_context", "")`.
3. 로그가 비었을 때 토큰이 추가되지 않도록 조건부 프롬프트 블록으로 감싼다 —
   `portfolio_manager.py`의 패턴을 그대로 가져오면 된다:
   ```python
   lessons_block = (
       f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
       if past_context else ""
   )
   ```
4. 토큰 비용을 고려하라. `get_past_context`는 전문 결정 최대 5개와 리플렉션 3개를
   반환한다. 수신 대상을 넓힐 거라면 `_run_graph()`의 호출 지점에서 더 작은
   `n_same` / `n_cross`를 전달하라.

## upstream 대비 제거된 것

이 포크에 없는 것: `rank_bm25` 의존성, `FinancialSituationMemory`,
`_tokenize`, `_rebuild_index`, `BM25Okapi`(`k1`/`b`/`epsilon` 튜닝),
`similarity_score`, `n_matches`, 에이전트별 메모리 인스턴스 5개,
`reflect_and_remember`, 그리고 `Reflector.reflect_{bull_researcher,bear_researcher,
trader,invest_judge,risk_manager}`.

대체 설계의 트레이드오프: 유사도 검색 없음(최신순 + 정확한 티커 일치만), 사람이 읽을 수
있고 git diff가 가능한 상태, 추가 의존성 제로, 기본적으로 프로세스 종료 후에도 유지,
그리고 리플렉션이 지연되므로 호출자가 넘겨준 문자열 대신 *실제 실현 수익률*을 쓸 수 있음.
