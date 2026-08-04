export const meta = {
  name: 'ta-watchlist-run',
  description: '워치리스트 트레이딩 분석 — 여러 종목에 ta-team-run을 돌리고 5단계 등급과 증거 게이트 통과 여부로 랭킹한다',
  whenToUse: '여러 종목을 같은 분석 기준일로 비교해 포지션 우선순위를 정할 때. args: {tickers: ["NVDA","AMD"], date: "YYYY-MM-DD", run_label_suffix: "optional"}. 종목당 에이전트 16개 내외가 돌므로 한 번에 2~3종목을 권장한다. 게이트를 통과하지 못한 종목은 랭킹에서 제외되고 별도로 보고된다. 산출물은 .claude/team-runs/ 아래에 종목별로 저장된다.',
  phases: [
    { title: 'Runs', detail: '종목별 ta-team-run (저장소 툴 → 12-에이전트 계통 → 증거 게이트)' },
    { title: 'Ranking', detail: '5단계 등급 랭킹 → 워치리스트 리포트 저장' },
  ],
}

// ---------------------------------------------------------------------------
// 입력. args가 JSON 문자열로 들어오는 경우가 있어 먼저 파싱을 시도한다.
// ---------------------------------------------------------------------------
const input = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { return {} } })()
  : (args || {})

const tickers = (input.tickers || []).map(t => String(t).toUpperCase())
if (!tickers.length) {
  throw new Error('ta-watchlist-run needs args: {tickers: ["NVDA", ...], date: "YYYY-MM-DD"}')
}
if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
  throw new Error('ta-watchlist-run needs an explicit date (YYYY-MM-DD) — the script cannot read the clock.')
}
const DATE = input.date

// 런 라벨은 산출물 디렉터리 이름이고 분석 날짜와 별개다. 같은 분석일을 다시
// 돌릴 때 기본값을 쓰면 이전 런 디렉터리를 덮어쓴다 — ta-team-run과 같은 규칙이다.
const labelFor = (ticker) => input.run_label_suffix
  ? `${input.run_label_suffix}-${ticker}`
  : `${DATE}-${ticker}`

// 5단계 PortfolioRating을 강세→약세 순으로. 랭킹의 1차 기준이다.
const RATING_ORDER = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell']
const ratingRank = (r) => {
  const i = RATING_ORDER.indexOf(r)
  return i === -1 ? RATING_ORDER.length : i
}

// ---------------------------------------------------------------------------
// Runs — 종목별 팀런. 서로 독립이므로 병렬 (동시 실행 수는 러너가 캡을 관리한다).
// ---------------------------------------------------------------------------
phase('Runs')
log(`워치리스트 ${tickers.length}종목, 분석 기준일 ${DATE}: ${tickers.join(', ')}`)

const runs = await parallel(tickers.map(t => () =>
  workflow('ta-team-run', {
    ticker: t, date: DATE, run_label: labelFor(t), context: input.context,
  })
))

const results = tickers.map((t, i) => ({ ticker: t, run: runs[i] }))

// 게이트를 통과하지 못한 런은 랭킹에 넣지 않는다. 증거가 검증되지 않은 등급을
// 다른 종목과 나란히 세우면 랭킹 자체가 거짓 판독이 된다.
const green = results.filter(r => r.run && r.run.gate?.green)
const red = results.filter(r => r.run && r.run.gate && !r.run.gate.green)
const dead = results.filter(r => !r.run)

if (red.length) log(`게이트 미통과: ${red.map(r => r.ticker).join(', ')} — 랭킹 제외`)
if (dead.length) log(`실행 실패: ${dead.map(r => r.ticker).join(', ')}`)

// ---------------------------------------------------------------------------
// Ranking — 규칙은 서술이 아니라 코드다.
// 1차: Portfolio Manager의 5단계 등급 (Buy가 가장 앞)
// 2차: degraded run은 뒤로 (저장소 툴 없이 웹만으로 만든 판정)
// 3차: 툴 공백이 적은 쪽이 앞으로 (증거가 두꺼운 판정)
// ---------------------------------------------------------------------------
phase('Ranking')

const ranked = green
  .map(r => {
    // 등급은 ta-team-run이 정규화해 넘긴 값을 그대로 쓴다. PM 산문에서 뽑으면
    // "Buy 신호는 없다" 같은 문장에서 Buy를 잘못 집는다. 값이 없으면 unknown으로
    // 남기고 추측해서 채우지 않는다 — 12번 파일이 정본이다.
    return {
      ticker: r.ticker,
      rating: RATING_ORDER.includes(r.run.portfolio_rating) ? r.run.portfolio_rating : 'unknown',
      run_dir: r.run.run_dir,
      decision_file: r.run.decision_file ?? `${r.run.run_dir}/12-portfolio-decision.md`,
      degraded: !!r.run.degraded_run,
      stale: !!r.run.stale_market_data,
      tool_calls: r.run.tool_calls_logged ?? 0,
      unavailable_tools: r.run.unavailable_tools ?? [],
      web_mismatches: (r.run.web_mismatches ?? []).length,
      research_plan: r.run.research_plan ?? '',
      trader_proposal: r.run.trader_proposal ?? '',
      portfolio_decision: r.run.portfolio_decision ?? '',
      pytest: r.run.gate?.pytest ?? '',
    }
  })
  .sort((a, b) => {
    if (a.degraded !== b.degraded) return a.degraded ? 1 : -1
    const dr = ratingRank(a.rating) - ratingRank(b.rating)
    if (dr !== 0) return dr
    return a.unavailable_tools.length - b.unavailable_tools.length
  })

if (!ranked.length) {
  return {
    outcome: 'no-green-runs',
    date: DATE,
    gate_red: red.map(r => ({ ticker: r.ticker, pytest: r.run.gate?.pytest, failures: r.run.gate?.failures })),
    failed: dead.map(r => r.ticker),
    note: '게이트를 통과한 런이 없어 랭킹을 만들지 않았다. 종목별 progress.md의 판결을 확인해라.',
  }
}

const REPORT_DIR = `.claude/team-runs/${input.run_label_suffix || DATE}-watchlist`

const summary = await agent(
  `TradingAgents 저장소에서 워치리스트 리포트를 저장해라. 새 리서치는 하지 마라 — 아래 데이터와 각 종목의 12-portfolio-decision.md 만 사용한다.

분석 기준일: ${DATE}
게이트 통과 ${ranked.length}종목 / 미통과 ${red.length}종목 / 실행 실패 ${dead.length}종목

랭킹 (규칙: degraded run 후순위 → 5단계 등급 Buy→Sell 순 → 툴 공백 적은 순):
${ranked.map((r, i) => `${i + 1}. ${r.ticker}: ${r.rating}${r.degraded ? ' [degraded]' : ''}${r.stale ? ' [stale]' : ''}
   run_dir: ${r.run_dir}
   pytest: ${r.pytest}
   결정 파일: ${r.decision_file}
   툴 로그 ${r.tool_calls}개, 미확보 툴 ${r.unavailable_tools.length}개(${r.unavailable_tools.join(', ') || '없음'}), 웹 불일치 ${r.web_mismatches}건
   PM: ${r.portfolio_decision.slice(0, 400)}`).join('\n')}
${red.length ? `\n게이트 미통과 (랭킹 제외):\n${red.map(r => `- ${r.ticker}: ${r.run.gate?.pytest ?? '?'}`).join('\n')}` : ''}
${dead.length ? `\n실행 실패: ${dead.map(r => r.ticker).join(', ')}` : ''}

${REPORT_DIR}/00-watchlist-summary.md 를 한국어로 작성해라 (계약 문자열은 영어). 다른 위치에 쓰지 마라. 담을 것:
- 랭킹 표 (Ticker / Rating / degraded·stale / 툴 로그 수 / 미확보 툴 / run_dir)
- 종목별 3~4문장 요약과 12-portfolio-decision.md 경로
- 게이트 미통과·실행 실패 종목을 별도 섹션에 명시 (조용히 빼지 마라)
- 여러 종목에 걸치는 공통 리스크·촉매
- Run boundary: 각 종목의 가격·지표·재무·소셜은 저장소 툴이 확정했고, Python LangGraph 전체 파이프라인 실행이 아니며, 5단계 등급은 리포의 PortfolioRating 어휘이고, 투자 자문이 아니라는 문구

파일을 Write한 뒤 경로를 반환해라.`,
  {
    label: 'watchlist-report', phase: 'Ranking', model: 'sonnet', effort: 'low',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', description: '저장한 워치리스트 리포트 경로' } },
    },
  }
)

return {
  outcome: (red.length || dead.length) ? 'complete-with-exclusions' : 'complete',
  date: DATE,
  ranking: ranked.map(r => ({
    ticker: r.ticker, rating: r.rating, degraded: r.degraded,
    run_dir: r.run_dir, unavailable_tools: r.unavailable_tools,
  })),
  gate_red: red.map(r => ({ ticker: r.ticker, pytest: r.run.gate?.pytest, failures: r.run.gate?.failures })),
  failed: dead.map(r => r.ticker),
  watchlist_report: summary ? summary.file : null,
  note: '투자 자문이 아니다. 게이트를 통과하지 못한 종목은 랭킹에서 제외됐다 — gate_red 를 확인해라.',
}
