export const meta = {
  name: 'ta-watchlist-run',
  description: '워치리스트 트레이딩 분석 — 여러 종목에 ta-team-run을 돌리고 시그널·신뢰도·손익비로 랭킹한다',
  whenToUse: '여러 종목을 같은 날짜 기준으로 비교 분석해 트레이딩 우선순위를 정할 때. args: {tickers: ["NVDA","AMD"], date: "YYYY-MM-DD", context: "optional"}. 종목당 에이전트 약 6개가 돌므로 한 번에 2~3종목을 권장한다. 각 종목은 저장소 @tool로 시장 데이터를 확정한 뒤 분석된다. 산출물은 .claude/team-runs/ 아래에 저장된다.',
  phases: [
    { title: 'Runs', detail: '종목별 ta-team-run (저장소 툴 → 애널리스트 → 리스크)' },
    { title: 'Ranking', detail: '시그널·신뢰도·R/R 랭킹 → 워치리스트 리포트 저장' },
  ],
}

// args가 JSON 문자열로 들어오면 파싱한다 — 객체 대신 문자열이 오면 tickers를
// 못 찾고 즉시 죽는다.
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

// ---------------------------------------------------------------------------
// Runs — 종목별 팀런. 서로 독립이므로 병렬 (동시 실행 수는 러너가 캡을 관리한다).
// ---------------------------------------------------------------------------
phase('Runs')
log(`워치리스트 ${tickers.length}종목 @ ${DATE}: ${tickers.join(', ')}`)

const runs = await parallel(tickers.map(t => () =>
  workflow('ta-team-run', { ticker: t, date: DATE, context: input.context })
))

const results = tickers.map((t, i) => ({ ticker: t, run: runs[i] }))
const failed = results.filter(r => !r.run || r.run.outcome === 'incomplete')
const done = results.filter(r => r.run && r.run.outcome !== 'incomplete')
if (failed.length) log(`완료 실패: ${failed.map(r => r.ticker).join(', ')}`)

// ---------------------------------------------------------------------------
// Ranking — 트레이딩 우선순위. 점수는 서술이 아니라 규칙이다:
// BUY/SELL(방향 있음) > HOLD, 그 안에서 신뢰도 내림차순. degraded run은 뒤로.
// ---------------------------------------------------------------------------
phase('Ranking')
const ranked = done
  .map(r => ({
    ticker: r.ticker,
    signal: r.run.final_signal,
    confidence: r.run.confidence,
    trade: r.run.trade,
    degraded: !!r.run.degraded_run,
    stale: !!r.run.stale_snapshot,
    verdicts: r.run.verdicts,
    key_takeaway: r.run.key_takeaway,
    report: r.run.final_report,
  }))
  .sort((a, b) => {
    const dir = s => (s === 'BUY' || s === 'SELL' ? 1 : 0)
    if (a.degraded !== b.degraded) return a.degraded ? 1 : -1
    if (dir(b.signal) !== dir(a.signal)) return dir(b.signal) - dir(a.signal)
    return (b.confidence || 0) - (a.confidence || 0)
  })

const summary = await agent(
  `TradingAgents 저장소에서 워치리스트 분석 결과를 리포트로 저장해라. 새 리서치는 하지 마라 — 아래 데이터와 각 종목의 05-final-report.md만 사용한다.

날짜: ${DATE}
랭킹 (규칙: 방향 시그널 우선, 신뢰도 내림차순, degraded run 후순위):
${ranked.map((r, i) => `${i + 1}. ${r.ticker}: ${r.signal} (${r.confidence}%)${r.degraded ? ' [degraded]' : ''}${r.stale ? ' [stale snapshot]' : ''} — entry ${r.trade?.entry || '-'} / target ${r.trade?.target || '-'} / stop ${r.trade?.stop || '-'} — ${r.key_takeaway}`).join('\n')}
${failed.length ? `실패: ${failed.map(r => r.ticker).join(', ')} — 리포트에 명시해라.` : ''}

.claude/team-runs/${DATE}-watchlist/00-watchlist-summary.md 를 한국어로 작성해라 (계약 문자열은 영어). 다른 위치에 쓰지 마라 — .claude/team-runs/가 팀런의 유일한 기록이다. 내용:
- 랭킹 표 (Ticker / Signal / Confidence / Entry / Target / Stop / R:R / 근거 한 줄)
- 종목별 3~4문장 요약 (각 .claude/team-runs/${DATE}-{TICKER}/05-final-report.md 경로 포함)
- 공통 리스크/촉매 (여러 종목에 걸치는 것)
- Run boundary: 각 종목의 가격·지표는 저장소 @tool로 확정했고 전체 Python 파이프라인 실행이 아니며 투자 자문이 아니라는 문구
파일을 Write한 뒤 경로를 반환해라.`,
  {
    label: 'watchlist-report', phase: 'Ranking', effort: 'low',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', description: '저장한 워치리스트 리포트 경로' } },
    },
  }
)

return {
  outcome: failed.length ? 'complete-with-failures' : 'complete',
  date: DATE,
  ranking: ranked.map(r => ({ ticker: r.ticker, signal: r.signal, confidence: r.confidence, trade: r.trade, degraded: r.degraded })),
  failed: failed.map(r => r.ticker),
  watchlist_report: summary ? summary.file : null,
  note: '투자 자문이 아니다. 종목별 상세는 .claude/team-runs/' + DATE + '-{TICKER}/05-final-report.md 참조.',
}
