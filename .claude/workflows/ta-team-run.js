export const meta = {
  name: 'ta-team-run',
  description: '트레이딩 팀런 — 저장소 데이터 툴로 수치를 확정하고 12-에이전트 계통으로 분석해 증거 게이트를 통과시킨다',
  whenToUse: '한 종목의 팀런을 한 번의 호출로 끝낼 때. args: {ticker: "NVDA", date: "YYYY-MM-DD"}. date는 필수다 — 스크립트는 시계를 읽을 수 없다. 산출물은 .claude/team-runs/{DATE}-{TICKER}/ 에만 저장되고, pytest 증거 게이트를 통과해야 런이 성립한다. 가격·지표·재무·소셜은 저장소 툴이 계산하고 에이전트는 해석한다. LLM provider API 키 불필요.',
  phases: [
    { title: 'P0 Repo Tools', detail: '저장소 데이터 툴 호출 → 00-market-data.md + tool-calls/' },
    { title: 'P1 Analysts', detail: 'market / sentiment / news / fundamentals 4인 병렬' },
    { title: 'P2 Debate', detail: 'Bull → Bear 순차 (Bear가 Bull을 반박)' },
    { title: 'P3 Research Manager', detail: '토론 히스토리만 읽고 ResearchPlan (5단계 rating)' },
    { title: 'P4 Trader', detail: 'TraderProposal (3단계 Buy/Hold/Sell)' },
    { title: 'P5 Risk Debate', detail: 'Aggressive → Conservative → Neutral 순차 회전' },
    { title: 'P6 Portfolio Manager', detail: 'PortfolioDecision (5단계 rating)' },
    { title: 'P7 Evidence Gate', detail: 'pytest 증거 게이트. 실패 시 최대 5라운드 복구' },
  ],
}

// ---------------------------------------------------------------------------
// 입력 — date는 필수 (스크립트는 시계를 읽을 수 없다).
// args가 JSON 문자열로 들어오는 경우가 실제로 있어 먼저 파싱을 시도한다.
// ---------------------------------------------------------------------------
function normalizeArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('{')) {
      try { return JSON.parse(text) } catch { /* 티커 문자열로 취급 */ }
    }
    return { ticker: text }
  }
  return {}
}

const input = normalizeArgs(args)
if (!input.ticker) throw new Error('ta-team-run needs args: {ticker: "NVDA", date: "YYYY-MM-DD"}')
if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
  throw new Error('ta-team-run needs an explicit date (YYYY-MM-DD) — the script cannot read the clock.')
}

const TICKER = input.ticker.toUpperCase()
const DATE = input.date
const RUN = `${DATE}-${TICKER}`
const RUN_DIR = `.claude/team-runs/${RUN}`
const EXTRA = input.context ? `\n추가 맥락: ${input.context}` : ''
const MAX_REPAIR_ROUNDS = 5   // SDD의 태스크당 상한. 초과 시 서킷브레이커.

// 모델 티어를 디스패치마다 명시한다. 생략하면 세션의 가장 비싼 모델을 조용히
// 상속하고(superpowers 실측: 리뷰어 26명이 최상위 티어에 올라간 사례), 반대로
// 최하위로 몰면 턴 수가 늘어 더 비싸진다.
const TIER = { tools: 'haiku', analyst: 'sonnet', debate: 'sonnet', decide: 'opus', gate: 'sonnet' }

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------
const P0_SCHEMA = {
  type: 'object',
  required: ['ok', 'verified_close', 'latest_row', 'stale', 'tool_calls_logged'],
  properties: {
    ok: { type: 'boolean', description: '00-market-data.md와 tool-calls/ 가 생성되었으면 true' },
    verified_close: { type: 'string', description: '예: "200.75". 실패 시 "unknown"' },
    latest_row: { type: 'string', description: 'YYYY-MM-DD, 실패 시 빈 문자열' },
    stale: { type: 'boolean', description: 'STALE OHLCV WARNING이 있으면 true' },
    tool_calls_logged: { type: 'number', description: 'tool-calls/ 안의 파일 수' },
    unavailable_tools: {
      type: 'array', items: { type: 'string' },
      description: 'DATA_UNAVAILABLE 또는 TOOL_FAILED 로 끝난 툴 이름들. Data Gaps의 근거가 된다',
    },
    detail: { type: 'string', description: '실패 이유 또는 특이사항, 없으면 빈 문자열' },
  },
}

const STAGE_SCHEMA = {
  type: 'object',
  required: ['file', 'summary'],
  properties: {
    file: { type: 'string', description: '네가 Write한 산출물의 정확한 경로' },
    verdict: { type: 'string', description: '판정 라인 값 (애널리스트만)' },
    summary: { type: 'string', description: '핵심 결론 3~5문장' },
    data_gaps: { type: 'array', items: { type: 'string' } },
    web_mismatches: { type: 'array', items: { type: 'string' }, description: '툴 값과 어긋난 웹 출처' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  required: ['green', 'summary_line', 'failures'],
  properties: {
    green: { type: 'boolean', description: 'pytest 실패 0일 때만 true' },
    summary_line: { type: 'string', description: 'pytest 마지막 줄 그대로' },
    failures: {
      type: 'array',
      description: '남은 실패. green이면 빈 배열',
      items: {
        type: 'object',
        required: ['test', 'reason', 'owner_stage'],
        properties: {
          test: { type: 'string' },
          reason: { type: 'string', description: '실제 assertion 메시지' },
          owner_stage: { type: 'string', description: '고쳐야 할 스테이지 (예: P1-market, P3, P6)' },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 공통 디스패치 변수. 에이전트가 어떻게 일하는지는 .claude/agents/ta-*.md가
// 단일 출처다 — 여기에 분석 지시를 다시 적지 않는다.
// ---------------------------------------------------------------------------
let PRICE = 'unknown'
let DEGRADED = true

const dispatch = (stageNote) => `TICKER: ${TICKER}
PRICE: ${PRICE}
DATE: ${DATE}
OUTPUT_DIR: ${RUN_DIR}
TOOL_CALLS_DIR: ${RUN_DIR}/tool-calls
TASK_ID: none (workflow run — TaskUpdate 단계는 생략해라)
REPORT_TO: workflow (SendMessage 단계는 생략해라 — 네 구조화 반환값이 보고다. 파일 Write는 반드시 해라)
${DEGRADED
  ? '주의: 저장소 툴 호출이 실패한 degraded run이다. 모든 정확한 수치에 출처와 기준일을 붙이고 그 사실을 리포트에 명시해라.'
  : `수치의 source of truth는 ${RUN_DIR}/tool-calls/ 의 툴 출력이다. 증거 게이트가 리포트의 수치를 그 로그와 대조한다. 웹 값이 다르면 "web source mismatch"로만 기록해라.`}
완료 후 ${RUN_DIR}/progress.md 에 한 줄 append 해라: "Stage <스테이지명>: complete"
리포트 본문은 한국어로 쓰고, 계약 문자열(판정 라인, SCHEMA 블록, 필드명, rating 값)은 영어를 유지해라.${EXTRA}
${stageNote}`

// ---------------------------------------------------------------------------
// P0 — 저장소 데이터 툴 (계산은 전부 저장소가 한다)
// ---------------------------------------------------------------------------
phase('P0 Repo Tools')
log(`${RUN}: 저장소 데이터 툴 호출`)

const p0 = await agent(
  `TradingAgents 저장소(/Users/realpio/Documents/speaky-TradingAgents)에서 데이터 툴 러너를 실행해라. 분석·해석은 하지 마라 — 실행과 결과 보고가 전부다.

1. 인터프리터: .venv/bin/python 이 있으면 그것, 없으면 python3
2. 실행: <python> .claude/skills/ta-team-analysis/scripts/repo_market_data.py ${TICKER} ${DATE} ${RUN_DIR}
   (이 러너는 저장소 데이터 툴을 호출하고 원본 출력을 ${RUN_DIR}/tool-calls/ 에 남긴다)
3. exit 0이면 stdout의 verified close / latest verified row를 보고하고, 00-market-data.md 에서 "STALE OHLCV WARNING" 유무를 확인해라.
4. tool-calls/ 안의 파일 수를 세고, 내용이 "DATA_UNAVAILABLE" 또는 "TOOL_FAILED" 로 시작하는 툴 이름을 모아라.
5. ${RUN_DIR}/progress.md 를 만들고 첫 줄을 정확히 "run: ${RUN}" 으로 써라. 그 다음 줄에 "Stage P0: complete" 를 써라.
6. exit 3 (REPO TOOLS UNAVAILABLE)이면 pip install -e . 를 한 번 시도하고 재실행해라. 그래도 실패하면 ok=false 와 이유를 보고해라.

러너를 수정하거나 대체 계산 코드를 작성하지 마라. 수치를 지어내지 마라.`,
  { label: 'repo-tools', phase: 'P0 Repo Tools', model: TIER.tools, effort: 'low', schema: P0_SCHEMA }
)

DEGRADED = !p0 || !p0.ok
PRICE = DEGRADED ? 'unknown' : `$${p0.verified_close} (verified close ${p0.latest_row})`
if (DEGRADED) log(`경고: P0 실패 — degraded run으로 진행 (${p0 ? p0.detail : 'p0 agent died'})`)
else log(`P0 완료: close ${p0.verified_close} (${p0.latest_row}), 툴 로그 ${p0.tool_calls_logged}개${p0.stale ? ' — STALE WARNING' : ''}`)

// ---------------------------------------------------------------------------
// P1 — 애널리스트 4인 병렬
//
// 리포는 애널리스트를 순차 실행하지만(setup.py:133) 서로의 리포트를 읽지 않으므로
// 병렬이 논리를 깨지 않는다. 의도적 divergence이며 벽시계 시간만 줄인다.
// 하류(Bull/Bear, 리스크 3인)가 네 리포트를 모두 읽어야 하므로 여기의 barrier는 필요하다.
// ---------------------------------------------------------------------------
phase('P1 Analysts')
const ANALYSTS = [
  { type: 'ta-market-analyst', label: 'market', stage: 'P1-market' },
  { type: 'ta-sentiment-analyst', label: 'sentiment', stage: 'P1-sentiment' },
  { type: 'ta-news-analyst', label: 'news', stage: 'P1-news' },
  { type: 'ta-fundamentals-analyst', label: 'fundamentals', stage: 'P1-fundamentals' },
]

const analysts = await parallel(ANALYSTS.map(a => () =>
  agent(dispatch(`스테이지명: ${a.stage}`), {
    label: a.label, phase: 'P1 Analysts', agentType: a.type,
    model: TIER.analyst, schema: STAGE_SCHEMA,
  })
))
const missingAnalysts = ANALYSTS.filter((a, i) => !analysts[i]).map(a => a.label)
if (missingAnalysts.length) log(`경고: 반환값 없는 애널리스트 — ${missingAnalysts.join(', ')}`)
log(`P1 판정: ${ANALYSTS.map((a, i) => `${a.label}=${analysts[i]?.verdict ?? '?'}`).join(' / ')}`)

// ---------------------------------------------------------------------------
// P2 — Bull → Bear 순차
//
// 리포에서 Bear는 investment_debate_state.current_response 로 Bull의 직전 주장을
// 읽고 반박한다(bear_researcher.py:13,45). 단일 슬롯 교대 구조이므로 병렬로
// 돌리면 반박이 사라진다 — 순차가 계약이다.
// ---------------------------------------------------------------------------
phase('P2 Debate')
const bull = await agent(dispatch('스테이지명: P2-bull'), {
  label: 'bull', phase: 'P2 Debate', agentType: 'ta-bull-researcher',
  model: TIER.debate, schema: STAGE_SCHEMA,
})
const bear = await agent(
  dispatch(`스테이지명: P2-bear
${RUN_DIR}/05-debate-history.md 의 마지막 블록이 Bull의 주장이다. 그것을 반박해라.`),
  { label: 'bear', phase: 'P2 Debate', agentType: 'ta-bear-researcher', model: TIER.debate, schema: STAGE_SCHEMA }
)
if (!bull || !bear) log('경고: 토론 한쪽이 반환값을 남기지 않았다 — 게이트가 파일로 검증한다')

// ---------------------------------------------------------------------------
// P3 — Research Manager (토론 히스토리만 읽는다)
// ---------------------------------------------------------------------------
phase('P3 Research Manager')
const rm = await agent(dispatch('스테이지명: P3'), {
  label: 'research-manager', phase: 'P3 Research Manager',
  agentType: 'ta-research-manager', model: TIER.debate, schema: STAGE_SCHEMA,
})

// ---------------------------------------------------------------------------
// P4 — Trader
// ---------------------------------------------------------------------------
phase('P4 Trader')
const trader = await agent(dispatch('스테이지명: P4'), {
  label: 'trader', phase: 'P4 Trader', agentType: 'ta-trader',
  model: TIER.debate, schema: STAGE_SCHEMA,
})

// ---------------------------------------------------------------------------
// P5 — 리스크 토론 순차 회전
//
// conditional_logic.py:69-73 의 회전 순서가 Aggressive → Conservative → Neutral 이고
// 게이트가 11-risk-history.md 에서 그 순서를 검사한다.
// ---------------------------------------------------------------------------
phase('P5 Risk Debate')
const RISK_SEATS = [
  { type: 'ta-aggressive-analyst', label: 'aggressive', stage: 'P5-aggressive' },
  { type: 'ta-conservative-analyst', label: 'conservative', stage: 'P5-conservative' },
  { type: 'ta-neutral-analyst', label: 'neutral', stage: 'P5-neutral' },
]
const riskSeats = []
for (const seat of RISK_SEATS) {
  riskSeats.push(await agent(dispatch(`스테이지명: ${seat.stage}`), {
    label: seat.label, phase: 'P5 Risk Debate', agentType: seat.type,
    model: TIER.debate, schema: STAGE_SCHEMA,
  }))
}

// ---------------------------------------------------------------------------
// P6 — Portfolio Manager (리스크 히스토리 + 두 계획 + past_context)
// ---------------------------------------------------------------------------
phase('P6 Portfolio Manager')
const pm = await agent(dispatch('스테이지명: P6'), {
  label: 'portfolio-manager', phase: 'P6 Portfolio Manager',
  agentType: 'ta-portfolio-manager', model: TIER.decide, schema: STAGE_SCHEMA,
})

// ---------------------------------------------------------------------------
// P7 — 증거 게이트. 실패하면 담당 스테이지를 재디스패치한다.
//
// 1~3라운드는 원래 에이전트 타입을 재개(컨텍스트가 온전하다), 4~5라운드는 상위
// 티어. 5라운드를 넘기면 서킷브레이커 — 판결을 원장에 남기고 사용자에게 올린다.
// ---------------------------------------------------------------------------
phase('P7 Evidence Gate')

const STAGE_AGENT = {
  'P1-market': 'ta-market-analyst', 'P1-sentiment': 'ta-sentiment-analyst',
  'P1-news': 'ta-news-analyst', 'P1-fundamentals': 'ta-fundamentals-analyst',
  'P2-bull': 'ta-bull-researcher', 'P2-bear': 'ta-bear-researcher',
  P3: 'ta-research-manager', P4: 'ta-trader',
  'P5-aggressive': 'ta-aggressive-analyst', 'P5-conservative': 'ta-conservative-analyst',
  'P5-neutral': 'ta-neutral-analyst', P6: 'ta-portfolio-manager',
}

const gatePrompt = (round) =>
  `TradingAgents 저장소에서 증거 게이트를 실행해라 (라운드 ${round}). 분석은 하지 마라 — 실행과 정확한 보고가 전부다.

  TEAM_RUN_DIR=${RUN_DIR} .venv/bin/python -m pytest tests/test_claude_team_artifacts.py -q

전체 출력을 읽고 마지막 요약 줄을 그대로 보고해라. 실패가 있으면 각 실패의 **실제 assertion 메시지**를 인용하고, 고쳐야 할 스테이지를 아래에서 골라라:
${Object.keys(STAGE_AGENT).join(' / ')}

산출물 파일을 네가 직접 수정하지 마라 — 담당 에이전트가 고친다. 테스트를 수정하지도 마라.`

let gate = null
const repairs = []
for (let round = 1; round <= MAX_REPAIR_ROUNDS + 1; round++) {
  gate = await agent(gatePrompt(round), {
    label: `gate:round${round}`, phase: 'P7 Evidence Gate',
    model: TIER.gate, effort: 'low', schema: GATE_SCHEMA,
  })
  if (!gate) throw new Error('Evidence gate agent died — run state unknown, stopping.')
  log(`게이트 라운드 ${round}: ${gate.summary_line}`)
  if (gate.green) break
  if (round > MAX_REPAIR_ROUNDS) break

  // 담당 스테이지별로 실패를 묶어 한 번씩만 재디스패치한다.
  const byStage = {}
  for (const f of gate.failures) {
    const stage = STAGE_AGENT[f.owner_stage] ? f.owner_stage : 'P6'
    ;(byStage[stage] = byStage[stage] || []).push(`${f.test}: ${f.reason}`)
  }
  for (const [stage, items] of Object.entries(byStage)) {
    log(`복구 라운드 ${round} → ${stage} (${items.length}건)`)
    const escalate = round >= 4
    const repair = await agent(
      dispatch(`스테이지명: ${stage} (복구 라운드 ${round})
증거 게이트가 네 산출물에서 다음을 지적했다. 산출물을 고쳐 다시 Write 해라:
${items.map(t => `- ${t}`).join('\n')}
${escalate ? '이전 시도가 세 번 실패했다. 계약 형식을 처음부터 다시 확인하고 작성해라.' : ''}
게이트는 산출물의 형식과 증거를 검사한다. 분석 내용을 바꾸는 것이 목적이 아니라 계약을 만족시키는 것이 목적이다.`),
      {
        label: `repair:${stage}:r${round}`, phase: 'P7 Evidence Gate',
        agentType: STAGE_AGENT[stage], model: escalate ? TIER.decide : TIER.debate,
        schema: STAGE_SCHEMA,
      }
    )
    repairs.push({ stage, round, ok: !!repair })
  }
}

// 서킷브레이커 — 상한에서만 판결한다. 판결은 원장에 남긴다 (조용한 폐기 금지).
if (!gate.green) {
  await agent(
    `${RUN_DIR}/progress.md 에 다음을 append 해라. 다른 파일은 건드리지 마라.

## Circuit breaker — ${MAX_REPAIR_ROUNDS} 라운드 후에도 증거 게이트 미통과
pytest: ${gate.summary_line}
${gate.failures.map(f => `- BLOCKED ${f.owner_stage} / ${f.test}: ${f.reason}`).join('\n')}

이 런은 게이트를 통과하지 못했다. 산출물을 파이프라인 비교나 메모리 기록에 사용하지 않는다.`,
    { label: 'circuit-breaker', phase: 'P7 Evidence Gate', model: TIER.gate, effort: 'low' }
  )
}

// ---------------------------------------------------------------------------
// 결과
// ---------------------------------------------------------------------------
return {
  outcome: gate.green ? 'gate-green' : 'gate-red',
  ticker: TICKER,
  date: DATE,
  run_dir: RUN_DIR,
  degraded_run: DEGRADED,
  stale_market_data: p0 ? !!p0.stale : false,
  tool_calls_logged: p0 ? p0.tool_calls_logged : 0,
  unavailable_tools: p0?.unavailable_tools ?? [],
  verdicts: {
    market: analysts[0]?.verdict ?? 'unknown',
    sentiment: analysts[1]?.verdict ?? 'unknown',
    news: analysts[2]?.verdict ?? 'unknown',
    fundamentals: analysts[3]?.verdict ?? 'unknown',
  },
  research_plan: rm?.summary ?? null,
  trader_proposal: trader?.summary ?? null,
  portfolio_decision: pm?.summary ?? null,
  gate: { green: gate.green, pytest: gate.summary_line, failures: gate.failures },
  repairs,
  web_mismatches: [...analysts, bull, bear, rm, trader, ...riskSeats, pm]
    .filter(Boolean).flatMap(r => r.web_mismatches || []),
  note: '투자 자문이 아니다. 게이트가 red면 이 산출물을 파이프라인 비교나 메모리 기록에 쓰지 않는다.',
}
