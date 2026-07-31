---
name: upstream-sync
description: >
  이 포크를 upstream TauricResearch/TradingAgents 저장소와 동기화하면서 로컬 커스터마이징
  (.gitignore, CLAUDE.md, .claude/)을 보존한다. "업스트림 싱크", "upstream 머지",
  "원본 저장소에서 업데이트", "포크 최신화", "TradingAgents 업데이트", "트레이딩에이전트 업데이트",
  "sync with upstream", "merge upstream", "update from upstream" 등의 요청 시 트리거.
  upstream 변경 확인, 새 커밋 체크, 포크 유지보수 관련 질문에도 사용한다.
version: 0.2.0
---

# Upstream Sync

이 포크(`nfbs2000/speaky-TradingAgents`)를 upstream(`TauricResearch/TradingAgents`)과
동기화하면서 로컬 커스터마이징을 보존하는 스킬.

## 저장소 정보

- **upstream**: `https://github.com/TauricResearch/TradingAgents.git` (remote: `upstream`)
- **origin**: `https://github.com/nfbs2000/speaky-TradingAgents.git`
- **기본 브랜치**: `main`

두 remote 모두 이미 설정되어 있다. 스크립트는 `upstream` remote URL이
`TauricResearch/TradingAgents`를 가리키지 않으면 경고 후 자동으로 교정하고,
remote 자체가 없으면 추가한다.

## 보호 대상

| 경로 | 보호 방식 | 이유 |
|------|-----------|------|
| `.gitignore` | 스크립트가 백업/복원 | 로컬 커스터마이징 보존 |
| `CLAUDE.md` | 스크립트가 백업/복원 | 프로젝트 전용 개발 가이드라인 보존 |
| `.claude/` | git이 자연 보호 | upstream에는 `.claude/`가 없어 merge 영향 없음 |

> **주의**: 현재 이 리포에는 `CLAUDE.md`가 없다. 스크립트는 `if [[ -f "$path" ]]`로
> 존재 여부를 확인하므로 없는 파일은 조용히 건너뛴다 — 에러가 아니다. upstream이
> `CLAUDE.md`를 추가하면 그대로 머지되어 들어온다 (보호할 로컬 버전이 없으므로).

> **GitHub Actions**: upstream의 워크플로우 변경은 수용한다 (CI 개선이 반영됨).
> revert하지 않으며, 머지 후 변경된 워크플로우가 있으면 리뷰를 안내한다.

## Pre-flight Checklist

스크립트 실행 전 Claude가 확인할 것:

1. **`git status`** — working tree가 clean인지. 변경사항이 있으면 먼저 커밋/stash 안내.
   스크립트도 `git diff-index --quiet HEAD`로 검사해 dirty면 exit 2로 중단한다.
   (untracked 파일은 경고만 하고 계속 진행한다.)
2. **현재 브랜치** — main에서 작업 중인지, 별도 브랜치가 필요한지.
3. **사용자 의도** — dry-run(미리보기)인지 실제 머지인지.

## 실행 방법

스크립트: `.claude/skills/upstream-sync/scripts/upstream-sync.sh`

### 모드 1: Dry-run (미리보기) — 항상 먼저 실행

```bash
bash .claude/skills/upstream-sync/scripts/upstream-sync.sh --dry-run
```

fetch만 수행하고 새 커밋 수, 최근 커밋 15개, 변경 파일 요약, 보호 파일이
건드려졌는지, 워크플로우 변경 여부를 출력한다. merge는 하지 않는다.
**기본적으로 이 모드를 먼저 실행해 사용자에게 변경 내용을 보여줘야 한다.**

### 모드 2: 표준 머지

```bash
bash .claude/skills/upstream-sync/scripts/upstream-sync.sh
```

`upstream/main`을 현재 브랜치에 머지한다. `.gitignore`와 `CLAUDE.md`는 자동
백업/복원되며, 복원이 필요했다면 커밋을 `--amend`한다.

### 모드 3: 별도 브랜치에서 머지 (권장)

```bash
bash .claude/skills/upstream-sync/scripts/upstream-sync.sh --branch upstream-sync-$(date +%Y%m%d)
```

새 브랜치를 만들고 그 위에서 머지한다. 리뷰 후 main에 머지할 수 있어 안전하다.
이 포크는 upstream과 크게 갈라져 있어(agent 구성, memory 시스템, LLM provider
레지스트리 등) 충돌 가능성이 높으므로 **이 모드를 우선 제안하라**.

## 결과 해석 및 Claude 행동

| Exit Code | 의미 | Claude 행동 |
|-----------|------|-------------|
| 0 | 성공 또는 이미 최신 | 결과 리포트 출력 → 빌드/테스트 검증 제안 |
| 1 | 비보호 파일 충돌 | 충돌 파일 목록 확인 → 각 파일 Read → 해결 방안 제시 |
| 2 | 사전조건 실패 (dirty tree, 네트워크, 잘못된 옵션) | 에러 메시지 해석 → 해결 방법 안내 |

exit 1일 때 스크립트는 보호 파일 충돌은 이미 로컬 버전으로 auto-resolve해 두고,
비보호 파일만 남긴 상태로 멈춘다. 해결 후:
```bash
git add <files> && git commit --no-edit
```

## Post-Sync 작업

머지 성공 후 Claude가 수행할 것:

1. **`.gitignore` 리뷰** — upstream이 변경했다면 스크립트가 로컬 버전을 복원했으므로
   `git diff upstream/main -- .gitignore`로 upstream 변경분을 확인하고, 새 ignore
   패턴이 있으면 수동 반영을 제안.
2. **`CLAUDE.md` 리뷰** — 같은 방식. (현재 로컬에 없으므로 upstream이 추가했다면
   그대로 들어온다.)
3. **`.github/workflows/` 리뷰** — 변경/추가되었다면 사용자에게 리뷰 안내.
4. **`.claude/` 확인** — `ta-*` 스킬 9개가 그대로 있는지 확인.
5. **빌드/테스트 검증 제안** — 아래 참조.
6. **스킬 사실 검증** — 이게 이 리포에서 가장 중요한 단계다. `ta-*` 스킬들은
   `tradingagents/` 내부 구조(agent 목록, 노드 이름, 라우팅 path map, 스키마,
   vendor 테이블, provider 레지스트리, memory 로그 포맷)를 문서화하고 있다.
   upstream merge가 그 중 하나라도 건드렸다면 스킬이 조용히 거짓말을 하게 된다.
   아래 드리프트 체크를 실행하라.

## 머지 후 스킬 드리프트 체크

```bash
# 1) 그래프 구조 — 노드 20개, 이름 변화 없는지
python3 -c "
from tradingagents.graph.setup import GraphSetup
from tradingagents.graph.conditional_logic import ConditionalLogic
from tradingagents.graph.analyst_execution import ANALYST_NODE_SPECS
keys = tuple(ANALYST_NODE_SPECS)
stub = {k: (lambda s: s) for k in keys}
wf = GraphSetup(None, None, stub, ConditionalLogic()).setup_graph(keys)
wf.compile(); print(len(wf.nodes), 'nodes'); print(sorted(wf.nodes))
"

# 2) 에이전트 팩토리 목록
python3 -c "import tradingagents.agents as a; print(sorted(n for n in a.__all__ if n.startswith('create_')))"

# 3) vendor 라우팅 테이블 정합성 (11 tools)
python3 -c "
from tradingagents.dataflows.interface import TOOLS_CATEGORIES, VENDOR_METHODS, get_category_for_method
for c, i in TOOLS_CATEGORIES.items():
    for t in i['tools']:
        assert t in VENDOR_METHODS and get_category_for_method(t) == c, t
print(sum(len(i['tools']) for i in TOOLS_CATEGORIES.values()), 'routed tools')
"

# 4) provider 레지스트리 (16 compat + 4 native)
python3 -c "
from tradingagents.llm_clients.openai_client import OPENAI_COMPATIBLE_PROVIDERS as P
print(len(P), 'openai-compatible:', sorted(P))
"

# 5) 평가 API 표면
python3 -c "
import inspect
from tradingagents.graph.trading_graph import TradingAgentsGraph as G
from tradingagents.agents.utils.rating import RATINGS_5_TIER
print(inspect.signature(G.propagate)); print(RATINGS_5_TIER)
print('reflect_and_remember back?', hasattr(G, 'reflect_and_remember'))
"

# 6) memory 시스템이 BM25로 되돌아갔는지
python3 -c "
import tradingagents.agents.utils.memory as m
print('TradingMemoryLog:', hasattr(m, 'TradingMemoryLog'))
print('FinancialSituationMemory (upstream BM25):', hasattr(m, 'FinancialSituationMemory'))
"
```

기대값 (머지 전 기준선):

| 체크 | 기대값 | 어긋나면 갱신할 스킬 |
|---|---|---|
| 1 | 20 nodes, `Portfolio Manager` / `Sentiment Analyst` 포함 | `ta-workflow-editor` |
| 2 | `create_portfolio_manager`, `create_sentiment_analyst` 존재 | `ta-agent-creator`, `ta-prompt-engineer` |
| 3 | `11 routed tools` | `ta-data-tools` |
| 4 | `16 openai-compatible` | `ta-llm-config` |
| 5 | `propagate(self, company_name, trade_date, asset_type='stock')`, 5-tier, `reflect_and_remember back? False` | `ta-eval-backtest` |
| 6 | `TradingMemoryLog: True`, `FinancialSituationMemory: False` | `ta-memory-manager` |

특히 6번이 `True/True`나 `False/True`로 바뀌면 upstream의 BM25 memory가 다시
들어온 것이므로 `ta-memory-manager`를 전면 재작성해야 한다.

## 빌드/테스트 검증

```bash
pip install -e ".[dev]"
pytest -q
ruff check .
```

기준선: `576 passed, 2 skipped` (2026-07-31 확인, `a33fd4c`).
`test_bedrock_provider.py`는 `langchain_aws` 미설치 시,
`test_deepseek_reasoning.py`는 `DEEPSEEK_API_KEY` 미설정 시 skip된다 — 정상이다.

## 워크플로우 예시

사용자: "업스트림 싱크해줘"

```
1. git status 확인 → clean이 아니면 커밋/stash 안내
2. --dry-run 실행 → 변경 내용 요약 제시
3. 사용자 확인 후 --branch 모드로 머지 (이 포크는 갈라짐이 커서 권장)
4. exit code에 따라 충돌 처리
5. pytest + ruff 검증
6. 스킬 드리프트 체크 실행 → 어긋난 스킬 갱신 제안
7. 결과 리포트
```
