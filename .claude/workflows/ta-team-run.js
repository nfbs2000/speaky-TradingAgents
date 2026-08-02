export const meta = {
  name: 'ta-team-run',
  description: '트레이딩 팀런 — 저장소 @tool로 시장 데이터를 확정한 뒤 리서치 에이전트 4명이 해석·종합한다',
  whenToUse: 'ta-team-analysis 스킬의 워크플로 판. 한 번의 호출로 P0 저장소 툴 → 애널리스트 3명 병렬 → 리스크 트레이더 → 최종 리포트까지 실행하고, 전부 .claude/team-runs/{DATE}-{TICKER}/에 저장한다. args: {ticker: "NVDA", date: "YYYY-MM-DD", context: "optional"}. date는 필수다 — 스크립트 안에서는 오늘 날짜를 알 수 없다. 가격·지표 계산은 저장소 @tool(get_verified_market_snapshot, get_stock_data, get_indicators)이 하고 에이전트는 해석만 한다. LLM provider API 키 불필요.',
  phases: [
    { title: 'Market Data', detail: '저장소 @tool 3개 호출 → 00-market-data.md' },
    { title: 'Analysts', detail: '기술 / 펀더멘털 / 뉴스·센티먼트 3명 병렬' },
    { title: 'Risk', detail: 'ta-risk-trader가 00~03을 읽고 FINAL SIGNAL' },
    { title: 'Synthesis', detail: '05-final-report.md 작성 + 파일 검증' },
  ],
}

// ---------------------------------------------------------------------------
// 입력 — date는 필수 (스크립트는 시계를 읽을 수 없다)
//
// args가 JSON 문자열로 들어오는 경우가 실제로 있다 (호출자가 객체 대신 문자열을
// 넘기면 date를 못 찾고 즉시 죽는다). 문자열이면 먼저 파싱을 시도한다.
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
if (!input.ticker) {
  throw new Error('ta-team-run needs args: {ticker: "NVDA", date: "YYYY-MM-DD"}')
}
if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
  throw new Error('ta-team-run needs an explicit date (YYYY-MM-DD) — the script cannot read the clock.')
}

const TICKER = input.ticker.toUpperCase()
const DATE = input.date
const RUN_DIR = `.claude/team-runs/${DATE}-${TICKER}`
const MARKET_DATA_PATH = `${RUN_DIR}/00-market-data.md`
const EXTRA = input.context ? `\n추가 맥락: ${input.context}` : ''

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------
const P0_SCHEMA = {
  type: 'object',
  required: ['ok', 'verified_close', 'latest_row', 'stale'],
  properties: {
    ok: { type: 'boolean', description: '00-market-data.md가 생성되었으면 true' },
    verified_close: { type: 'string', description: '예: "200.75". 실패 시 "unknown"' },
    latest_row: { type: 'string', description: 'YYYY-MM-DD, 실패 시 빈 문자열' },
    stale: { type: 'boolean', description: 'STALE OHLCV WARNING이 있으면 true' },
    detail: { type: 'string', description: '실패 이유 또는 특이사항, 없으면 빈 문자열' },
  },
}

const ANALYST_SCHEMA = {
  type: 'object',
  required: ['file', 'verdict', 'summary'],
  properties: {
    file: { type: 'string', description: '네가 Write한 리포트의 정확한 경로' },
    verdict: { type: 'string', description: '판정 라인 값 그대로 (Neutral / Strong / Mixed 등)' },
    summary: { type: 'string', description: '핵심 결론 3~5문장' },
    data_gaps: { type: 'array', items: { type: 'string' } },
    web_mismatches: { type: 'array', items: { type: 'string' }, description: '00과 어긋난 웹 출처 값' },
  },
}

const RISK_SCHEMA = {
  type: 'object',
  required: ['file', 'signal', 'confidence', 'summary'],
  properties: {
    file: { type: 'string' },
    signal: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
    confidence: { type: 'number', description: '0~100' },
    entry: { type: 'string' },
    target: { type: 'string' },
    stop: { type: 'string' },
    summary: { type: 'string' },
  },
}

const SYNTH_SCHEMA = {
  type: 'object',
  required: ['file', 'final_signal', 'files_verified', 'key_takeaway'],
  properties: {
    file: { type: 'string' },
    final_signal: { type: 'string' },
    files_verified: { type: 'boolean', description: '00~05가 모두 RUN_DIR에 존재하고 판정 라인이 확인되면 true' },
    missing: { type: 'array', items: { type: 'string' } },
    key_takeaway: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// P0 — 저장소 @tool로 시장 데이터 확정 (계산은 전부 저장소가 한다)
// ---------------------------------------------------------------------------
phase('Market Data')
log(`P0: ${TICKER} @ ${DATE} — 저장소 @tool 호출`)

const p0 = await agent(
  `TradingAgents 저장소(/Users/realpio/Documents/speaky-TradingAgents)에서 저장소 툴 러너를 실행해라. 분석·해석은 하지 마라 — 실행과 결과 보고가 전부다.

1. 인터프리터: .venv/bin/python 이 있으면 그것, 없으면 python3
2. 실행: <python> .claude/skills/ta-team-analysis/scripts/repo_market_data.py ${TICKER} ${DATE} ${MARKET_DATA_PATH}
   (이 러너는 저장소의 @tool 3개 get_verified_market_snapshot / get_stock_data / get_indicators 를 호출할 뿐이다)
3. exit 0이면 stdout의 verified close / latest verified row를 보고하고, 파일에서 "STALE OHLCV WARNING" 유무를 확인해라.
4. exit 3 (REPO TOOLS UNAVAILABLE)이면 pip install -e . 를 한 번 시도하고 재실행해라. 그래도 실패하면 ok=false와 실패 이유를 보고해라.
러너를 수정하거나 대체 계산 코드를 작성하지 마라. 수치를 지어내지 마라.`,
  { label: 'repo-market-data', phase: 'Market Data', effort: 'low', schema: P0_SCHEMA }
)

const degraded = !p0 || !p0.ok
const PRICE = degraded ? 'unknown' : `$${p0.verified_close} (verified close ${p0.latest_row})`
const MARKET_DATA = degraded
  ? `none (repo tools unavailable: ${p0 ? p0.detail : 'p0 agent died'})`
  : MARKET_DATA_PATH
if (degraded) log('경고: 저장소 툴 실패 — web-only degraded run으로 진행한다')
else log(`P0 완료: close ${p0.verified_close} (${p0.latest_row})${p0.stale ? ' — STALE WARNING' : ''}`)

// 실행별 변수만 넘긴다. 에이전트가 어떻게 일하는지는 .claude/agents/ta-*.md가 단일 출처다.
const dispatch = (taskNote) => `TICKER: ${TICKER}
PRICE: ${PRICE}
DATE: ${DATE}
OUTPUT_DIR: ${RUN_DIR}
MARKET_DATA: ${MARKET_DATA}
TASK_ID: none (workflow run — TaskUpdate 단계는 생략해라)
REPORT_TO: workflow (SendMessage 단계는 생략해라 — 네 구조화 반환값이 보고다. 리포트 파일 Write는 반드시 해라)
${degraded ? '주의: 저장소 툴 호출이 실패한 web-only degraded run이다. 모든 정확한 수치에 출처와 기준일을 붙이고 그 사실을 리포트에 명시해라.' : '00-market-data.md가 정확한 가격·지표·거래량 수치의 source of truth다. 웹 값이 다르면 "web source mismatch"로만 기록해라.'}
리포트는 한국어로 작성한다 (판정 라인 등 계약 문자열은 영어 유지).${EXTRA}
${taskNote}`

// ---------------------------------------------------------------------------
// Analysts — 서로의 출력을 읽지 않으므로 병렬. 리스크가 셋을 다 읽어야 하므로
// 여기의 barrier는 의도된 것이다.
// ---------------------------------------------------------------------------
phase('Analysts')
const ANALYSTS = [
  { type: 'ta-market-analyst', label: 'technical' },
  { type: 'ta-fundamentals-analyst', label: 'fundamentals' },
  { type: 'ta-news-sentiment-analyst', label: 'news-sentiment' },
]

const analystResults = await parallel(ANALYSTS.map(a => () =>
  agent(dispatch(''), { label: a.label, phase: 'Analysts', agentType: a.type, schema: ANALYST_SCHEMA })
))

const [technical, fundamentals, sentiment] = analystResults
const missingAnalysts = ANALYSTS.filter((a, i) => !analystResults[i]).map(a => a.type)
if (missingAnalysts.length) log(`경고: 반환값 없는 애널리스트 — ${missingAnalysts.join(', ')}`)

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------
phase('Risk')
const risk = await agent(
  dispatch(`애널리스트 요약 (참고용 — 반드시 디스크의 리포트 원문을 읽어라):
- technical: ${technical ? `${technical.verdict} — ${technical.summary}` : '반환값 없음 (파일은 존재할 수 있다)'}
- fundamentals: ${fundamentals ? `${fundamentals.verdict} — ${fundamentals.summary}` : '반환값 없음 (파일은 존재할 수 있다)'}
- news/sentiment: ${sentiment ? `${sentiment.verdict} — ${sentiment.summary}` : '반환값 없음 (파일은 존재할 수 있다)'}
01~03 중 실제로 없거나 빈 파일이 있으면 진행하지 말고 그 사실을 summary에 적고 file은 빈 문자열로 반환해라.`),
  { label: 'risk-trader', phase: 'Risk', agentType: 'ta-risk-trader', schema: RISK_SCHEMA }
)
if (!risk || !risk.file) {
  return {
    outcome: 'incomplete',
    reason: risk ? risk.summary : 'risk trader died',
    degraded_run: degraded,
    run_dir: RUN_DIR,
    note: '입력 리포트가 불완전하다. 누락 애널리스트를 다시 실행한 뒤 재시도해라.',
  }
}
log(`리스크 결정: ${risk.signal} (${risk.confidence}%)`)

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------
phase('Synthesis')
const synth = await agent(
  `TradingAgents 저장소에서 트레이딩 팀런의 최종 종합을 수행해라.

1. Skill 도구로 ta-team-analysis 스킬을 로드해 05 템플릿과 검증 체크리스트를 확보해라.
2. ${RUN_DIR}/ 의 00~04가 존재하고 비어 있지 않은지, 판정 라인(## Technical Direction: / ## Fundamental Rating: / ## Sentiment Direction: / ## FINAL SIGNAL:)이 있는지 검증해라.${degraded ? ' (degraded run이라 00이 없다 — Run boundary에 반영해라.)' : ''}
3. 파일을 모두 읽고 스킬 템플릿대로 ${RUN_DIR}/05-final-report.md 를 한국어로 작성해라. Repo-Tool Market Data 섹션, Data Gaps("none"이라도), Run boundary 문구를 빠뜨리지 마라.
4. entry/target/stop/R:R이 verified close(${PRICE}) 기준으로 산술 일관인지 검산하고, 불일치가 있으면 05에 기록해라.

산출물은 전부 ${RUN_DIR}/ 안에 있어야 한다. output/ 로 복사하지 마라.
리스크 결정 참고: ${risk.signal} (${risk.confidence}%), entry ${risk.entry || '-'} / target ${risk.target || '-'} / stop ${risk.stop || '-'}`,
  { label: 'synthesis', phase: 'Synthesis', schema: SYNTH_SCHEMA }
)
if (!synth) throw new Error('Synthesis agent died — reports exist on disk but 05 was not verified.')

return {
  outcome: synth.files_verified ? 'complete' : 'complete-with-gaps',
  ticker: TICKER,
  date: DATE,
  degraded_run: degraded,
  stale_market_data: p0 ? !!p0.stale : false,
  final_signal: risk.signal,
  confidence: risk.confidence,
  trade: { entry: risk.entry, target: risk.target, stop: risk.stop },
  verdicts: {
    technical: technical ? technical.verdict : 'unknown',
    fundamentals: fundamentals ? fundamentals.verdict : 'unknown',
    sentiment: sentiment ? sentiment.verdict : 'unknown',
  },
  web_mismatches: [technical, fundamentals, sentiment].filter(Boolean).flatMap(r => r.web_mismatches || []),
  missing: synth.missing || [],
  key_takeaway: synth.key_takeaway,
  run_dir: RUN_DIR,
  final_report: synth.file,
  note: '투자 자문이 아니다. Run boundary는 05-final-report.md에 명시되어 있다.',
}
