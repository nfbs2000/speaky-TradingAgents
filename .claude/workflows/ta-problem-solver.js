export const meta = {
  name: 'ta-problem-solver',
  description: 'TradingAgents 문제를 진단하고, 담당 ta-* 스페셜리스트에게 수정을 배정한 뒤, 그린이 될 때까지 검증한다',
  whenToUse: '이 저장소의 모든 문제 — 버그, 실패하는 테스트, 리그레션, "X가 동작을 멈췄다", 머지 이후 깨짐. 진단 단계에서 재현하고 원인 위치를 좁히면, 담당 스페셜리스트가 수정하고, ta-maintainer가 576-테스트 베이스라인 대비로 검증하며, 회의적 검토자가 근본 원인을 확인한다. 문제는 args로 전달한다: {problem: "...", repro: "optional command", context: "optional extra detail"}.',
  phases: [
    { title: '진단', detail: '재현, 원인 위치 특정, 담당자에게 배정' },
    { title: '수정', detail: '담당 ta-* 스페셜리스트가 소유권 순서대로 수정을 적용한다' },
    { title: '검증', detail: 'pytest + ruff + 포크 가드레일, 그린이 될 때까지 복구 루프' },
    { title: '리뷰', detail: '적대적 근본 원인 점검' },
  ],
}

// ---------------------------------------------------------------------------
// 입력 정규화
// ---------------------------------------------------------------------------
const input = typeof args === 'string' ? { problem: args } : (args || {})
if (!input.problem) {
  throw new Error(
    'ta-problem-solver needs a problem statement. ' +
    'Invoke with args: {problem: "<what is broken>", repro: "<optional repro command>", context: "<optional detail>"}'
  )
}

const MAX_REPAIR_ROUNDS = 2 // 진단-수정 + 포기 전까지 최대 2회의 복구 라운드

// 수정을 배정할 수 있는 개발/유지보수 스페셜리스트 7종. 각 에이전트 정의는
// 첫 동작으로 자신의 .claude/skills/* 스킬을 로드한다.
const SPECIALISTS = [
  'ta-agent-smith',    // 에이전트 파일, 프롬프트, agents/schemas.py, 레이팅 어휘
  'ta-graph-engineer', // graph/setup.py, conditional_logic.py, 라우팅, 패스 맵, 체크포인트
  'ta-data-engineer',  // agents/utils/*_tools.py, dataflows/, 벤더, 인디케이터
  'ta-llm-engineer',   // llm_clients/, 프로바이더/모델 설정, _get_provider_kwargs
  'ta-memory-engineer',// agents/utils/memory.py, graph/reflection.py, trading_memory.md
  'ta-evaluator',      // 실행/결과 분석, full_states_log JSON, 비용
  'ta-maintainer',     // 업스트림 머지 후폭풍, 드리프트, 베이스라인 상태
]

const ROUTING_TABLE = `
주제어가 아니라 반드시 바뀌어야 하는 산출물을 기준으로 배정해라:
- 프롬프트 텍스트, system_message, agents/schemas.py, 신규/고장난 에이전트 -> ta-agent-smith
- graph/setup.py, conditional_logic.py, analyst_execution.py, 노드 이름, 토론 라운드, 체크포인팅 -> ta-graph-engineer
- agents/utils/*_tools.py, dataflows/, 벤더, 인디케이터, 매크로/센티먼트 소스 -> ta-data-engineer
- llm_clients/, 프로바이더/모델 선택, reasoning-effort/thinking 조절값, _get_provider_kwargs -> ta-llm-engineer
- agents/utils/memory.py, graph/reflection.py, trading_memory.md, 벤치마크/실현수익 로직 -> ta-memory-engineer
- 실행 출력 해석, 설정 비교, full_states_log_*.json -> ta-evaluator
- 업스트림 머지 후폭풍, "머지 전에는 베이스라인이 그린이었다", 스킬 드리프트 증상 -> ta-maintainer

소유권 순서 규칙 (이를 어기는 것 자체가 버그다):
- 툴은 존재하고 라우팅되어야 하고(ta-data-engineer), 그다음 ToolNode에 바인딩되어야 하며(ta-graph-engineer), 그다음에야 프롬프트가 그것을 지칭할 수 있다(ta-agent-smith)
- 레이팅 어휘는 rating.py, schemas.py, signal_processing.py에 걸쳐 있다 -> 담당자는 ta-agent-smith 한 명, 절대 나누지 않는다
- 업스트림 머지 이후의 모든 작업은 ta-maintainer의 드리프트 체크로 시작한다
`

const ENV_CONTRACT = `
환경 계약 (모든 검증이 이에 의존한다):
- 프로젝트 venv가 ./.venv에 있다 — 검사는 .venv/bin/python -m pytest 와 .venv/bin/python -m ruff check . 로 실행해라
- ./.venv가 없다면: python3를 사용하고 (python shim은 없다), "import tradingagents.graph.*"가 yfinance에서 실패하면 먼저 새 venv에서 pip install -e ".[dev]"를 실행해라.
- 테스트 베이스라인: 576 passed, 2 skipped (test_bedrock_provider.py, test_deepseek_reasoning.py). ruff check . 는 깨끗하게 통과한다.
- 유료 LLM 파이프라인이나 백테스트 스윕은 절대 실행하지 마라 — 오직 테스트로만 검증해라.
- .claude/skills/** 는 수정하지 마라 — 스킬이 코드를 잘못 설명하고 있다면 대신 그 드리프트를 보고해라.
- 커밋이나 푸시를 하지 마라.
`

const FORK_GUARDRAILS = `
포크 고유 가드레일 — 다음을 포함하는 변경은 거부하거나 플래그를 세워라:
- create_x(llm, memory) — 이 저장소의 어떤 팩토리도 memory 인자를 받지 않는다
- FinancialSituationMemory, BM25, reflect_and_remember() — 모두 존재하지 않는다
- 리스크 판정자로서의 "Risk Manager" — 실제로는 Portfolio Manager다
- 활성 에이전트로서의 social_media_analyst — sentiment_analyst의 폐기된 별칭이다 (와이어 키 "social")
- 파이프라인 시그널로서의 BUY/SELL/HOLD — 실제로는 5단계 Title-case Buy/Overweight/Hold/Underweight/Sell 이다
- {ticker} 프롬프트 변수 — 종목 식별 정보는 {instrument_context}로 전달된다
- + get_language_instruction() 이 없는 프롬프트
- 대응되는 DEBATE_PATH_MAP / RISK_ANALYSIS_PATH_MAP 항목이 없는 새 라우터 반환값
- 로그 경로로서의 eval_results/ — 로그는 results_dir (~/.tradingagents/logs) 아래에 쌓인다
`

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------
const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['reproduced', 'diagnosis', 'fix_needed', 'plan'],
  properties: {
    reproduced: { type: 'boolean', description: '문제를 재현했는지 (또는 증거로 확인했는지) 여부' },
    repro_command: { type: 'string', description: '문제를 보여주는 정확한 커맨드, 없으면 빈 문자열' },
    evidence: { type: 'string', description: '실제 에러 출력 / 실패한 assertion / 관찰된 잘못된 동작' },
    diagnosis: { type: 'string', description: '근본 원인 가설: 어느 파일/함수가 잘못되었고 왜 그런지' },
    fix_needed: { type: 'boolean', description: '코드 변경이 필요 없는 질문/오해라면 false' },
    plan: {
      type: 'array',
      description: '순서가 있는 수정 작업 목록, 담당 스페셜리스트별로 하나씩, 소유권 순서대로 (fix_needed가 false면 비어 있을 수 있다)',
      items: {
        type: 'object',
        required: ['owner', 'task'],
        properties: {
          owner: { type: 'string', enum: SPECIALISTS },
          task: { type: 'string', description: '명령형 작업 지시: 건드릴 파일, 변경 내용, 수용 기준 검사, 건드리면 안 되는 것' },
        },
      },
    },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['done', 'summary', 'changed_files'],
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string', description: '무엇을 바꿨고 그것이 왜 근본 원인을 해결하는지' },
    changed_files: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'string', description: '불확실하게 남은 것, 없으면 빈 문자열' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['green', 'pytest_summary', 'ruff_clean', 'problem_resolved', 'failures', 'guardrail_violations'],
  properties: {
    green: { type: 'boolean', description: 'pytest가 576/2 베이스라인과 일치하고 동시에 ruff가 깨끗할 때만 true' },
    pytest_summary: { type: 'string', description: '실제 pytest 마지막 줄, 예: "576 passed, 2 skipped"' },
    ruff_clean: { type: 'boolean' },
    problem_resolved: { type: 'boolean', description: '원래의 재현/증거가 더 이상 발생하지 않으면 true' },
    failures: {
      type: 'array',
      description: '남은 실패 목록, 그린이면 비어 있다',
      items: {
        type: 'object',
        required: ['what', 'error', 'suspected_owner'],
        properties: {
          what: { type: 'string' },
          error: { type: 'string' },
          suspected_owner: { type: 'string', enum: SPECIALISTS },
        },
      },
    },
    guardrail_violations: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['root_cause_fixed', 'verdict'],
  properties: {
    root_cause_fixed: { type: 'boolean', description: '변경이 증상만 억누르는 것이라면 false' },
    verdict: { type: 'string', description: '찾아낸 가장 강력한 반론을 담은 한 문단짜리 판정' },
    residual_risks: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// 1단계 — 진단: 재현, 원인 위치 특정, 배정
// ---------------------------------------------------------------------------
phase('진단')
log(`진단 중: ${input.problem}`)

const triage = await agent(
  `너는 /Users/realpio/Documents/speaky-TradingAgents 에 있는 TradingAgents 저장소에서 보고된 문제를 진단하고 있다.

문제: ${input.problem}
${input.repro ? `보고된 재현 방법: ${input.repro}` : ''}
${input.context ? `추가 맥락: ${input.context}` : ''}

체계적 디버깅 원칙을 따라라 — 가설보다 증거가 먼저이고, 수정보다 재현이 먼저다:
1. 재현: 주어진 재현 방법이 있으면 실행해라. 없으면 문제를 드러낼 가장 좁은 커맨드를 실행해라 (특정 pytest, import, CLI 호출). 실제 에러 출력을 확보해라. 문제가 유료 파이프라인에서만 나타난다면 그것을 실행하지 마라 — 대신 코드와 테스트로 추론하고 그 사실을 밝혀라.
2. 베이스라인: 스위트가 이미 레드인지 확인해라 (pytest -q 마지막 줄이면 충분하다). 기대 베이스라인: 576 passed, 2 skipped.
3. 원인 위치 특정: 실패하는 코드 경로를 읽어라 (Grep/Read). 어느 파일과 함수가 잘못되었고 왜 그런지 짚어낼 수 있을 때까지 읽어라.
4. 배정: 아래 표를 사용해 필요한 각 변경을 담당 스페셜리스트에게, 소유권 순서대로 배정해라:
${ROUTING_TABLE}
${ENV_CONTRACT}
각 plan 작업 설명은 그 자체로 완결되어야 한다: 정확한 파일, 변경 내용, 수용 기준 검사, 그리고 절대 건드리면 안 되는 것을 명시해라. 문제가 결국 오해나 질문으로 밝혀지면 (잘못된 코드가 없다면) fix_needed=false로 두고 diagnosis에 설명해라.`,
  { label: 'triage', phase: '진단', schema: TRIAGE_SCHEMA }
)

if (!triage) throw new Error('Triage agent died — nothing to act on.')
log(`진단 결과: ${triage.diagnosis}`)

if (!triage.fix_needed || triage.plan.length === 0) {
  return {
    outcome: 'no-fix-needed',
    reproduced: triage.reproduced,
    diagnosis: triage.diagnosis,
    evidence: triage.evidence,
  }
}

// ---------------------------------------------------------------------------
// 2단계 — 수정: 담당 스페셜리스트를 순차적으로 배정한다 (소유권 순서)
// ---------------------------------------------------------------------------
phase('수정')
const fixReports = []
for (const [i, task] of triage.plan.entries()) {
  const owner = SPECIALISTS.includes(task.owner) ? task.owner : 'ta-maintainer'
  log(`수정 ${i + 1}/${triage.plan.length} -> ${owner}`)
  const prior = fixReports.length
    ? `\n이번 실행에서 동료들이 이미 완료한 작업:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (파일: ${r.changed_files.join(', ')})`).join('\n')}`
    : ''
  const report = await agent(
    `먼저 네 스킬을 로드한 다음 이것을 수정해라. 너는 이미 진단된 문제를 다루고 있다. 정확히 네 작업만 하고, 그 외에는 아무것도 하지 마라.

원래 문제: ${input.problem}
근본 원인 진단: ${triage.diagnosis}
증거: ${triage.evidence}
${triage.repro_command ? `재현 커맨드: ${triage.repro_command}` : ''}
네 작업: ${task.task}
${prior}
${ENV_CONTRACT}
${FORK_GUARDRAILS}
증상이 아니라 근본 원인을 고쳐라 — 실패하는 테스트를 통과시키려고 약화시키거나 삭제하지 마라. 수정 후에는 가장 좁은 관련 검사를 실행해라 (대상 pytest + 건드린 파일에 대한 ruff). 정직하게 보고해라: 뭔가 동작하지 않으면 concerns에 그렇다고 적어라.`,
    { label: `fix:${owner}`, phase: '수정', agentType: owner, schema: FIX_SCHEMA }
  )
  if (report) fixReports.push({ owner, ...report })
  else log(`경고: ${owner}가 아무것도 반환하지 않았다 — 누락은 검증 단계에서 잡힌다`)
}

// ---------------------------------------------------------------------------
// 3단계 — 검증: 전체 베이스라인 + 가드레일, 그린이 될 때까지 복구 루프
// ---------------------------------------------------------------------------
const verifyPrompt = (round) =>
  `먼저 네 스킬을 로드해라. 수정 이후의 저장소를 검증해라 (검증 라운드 ${round}).

원래 문제: ${input.problem}
${triage.repro_command ? `원래 재현 방법: ${triage.repro_command} — 다시 실행해서 문제가 사라졌는지 확인해라.` : '증거를 근거로 원래 문제가 해결되었는지 확인해라.'}
원래 증거: ${triage.evidence}
주장된 수정 내역:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (파일: ${r.changed_files.join(', ')})`).join('\n')}

그 주장을 그대로 믿지 마라:
1. git diff — 모든 변경을 직접 읽어라.
2. pytest -q — 전체 스위트. 그린이란 정확히 베이스라인을 뜻한다: 576 passed, 2 skipped (수정이 정당하게 추가한 테스트가 있다면 그만큼 더 — 개수를 세어 밝혀라).
3. ruff check . — 깨끗해야 한다.
4. 아래 포크 가드레일에 비추어 diff를 검사하고 위반 사항을 모두 나열해라:
${FORK_GUARDRAILS}
${ENV_CONTRACT}
남은 실패마다 다음을 사용해 담당으로 의심되는 스페셜리스트를 지목해라:
${ROUTING_TABLE}`

phase('검증')
let verify = null
for (let round = 1; round <= MAX_REPAIR_ROUNDS + 1; round++) {
  verify = await agent(verifyPrompt(round), {
    label: `verify:round${round}`, phase: '검증', agentType: 'ta-maintainer', schema: VERIFY_SCHEMA,
  })
  if (!verify) throw new Error('Verification agent died — repo state unknown, stopping.')
  log(`검증 라운드 ${round}: ${verify.pytest_summary}, ruff ${verify.ruff_clean ? '깨끗함' : '더러움'}, 해결됨=${verify.problem_resolved}`)

  if (verify.green && verify.problem_resolved && verify.guardrail_violations.length === 0) break
  if (round > MAX_REPAIR_ROUNDS) break

  const issues = [
    ...verify.failures.map(f => ({ owner: f.suspected_owner, text: `${f.what}: ${f.error}` })),
    ...verify.guardrail_violations.map(v => ({ owner: triage.plan[0].owner, text: `가드레일 위반: ${v}` })),
    ...(!verify.problem_resolved ? [{ owner: triage.plan[0].owner, text: `원래 문제가 여전히 재현된다: ${triage.evidence}` }] : []),
  ]
  // 각 스페셜리스트가 한 번에 통합된 패스를 받도록 복구 작업을 담당자별로 묶는다
  const byOwner = {}
  for (const it of issues) {
    const o = SPECIALISTS.includes(it.owner) ? it.owner : 'ta-maintainer'
    ;(byOwner[o] = byOwner[o] || []).push(it.text)
  }
  for (const [owner, list] of Object.entries(byOwner)) {
    log(`복구 라운드 ${round} -> ${owner} (이슈 ${list.length}건)`)
    const repair = await agent(
      `먼저 네 스킬을 로드해라. "${input.problem}"에 대한 네 팀의 수정이 검증을 완전히 통과하지 못했다. 다음을 복구해라. 근본 원인만 고치고, 통과시키려고 테스트를 약화시키지 마라:
${list.map(t => `- ${t}`).join('\n')}
맥락 — 진단: ${triage.diagnosis}
지금까지의 변경: ${fixReports.map(r => `${r.owner}: ${r.changed_files.join(', ')}`).join(' | ')}
${ENV_CONTRACT}
${FORK_GUARDRAILS}
수정 후에는 보고하기 전에 가장 좁은 관련 검사를 직접 실행해라.`,
      { label: `repair:${owner}`, phase: '검증', agentType: owner, schema: FIX_SCHEMA }
    )
    if (repair) fixReports.push({ owner, ...repair })
  }
}

// ---------------------------------------------------------------------------
// 4단계 — 리뷰: 적대적 근본 원인 점검 (그린일 때만)
// ---------------------------------------------------------------------------
let review = null
if (verify.green && verify.problem_resolved) {
  phase('리뷰')
  review = await agent(
    `적대적 리뷰. TradingAgents 저장소의 문제가 방금 "수정"되었고 테스트 스위트는 그린이다. 네 임무는 그 수정을 반박하는 것이다 — diff가 아니라고 증명하기 전까지는 증상 땜질이라고 가정해라.

문제: ${input.problem}
진단: ${triage.diagnosis}
증거: ${triage.evidence}
적용된 수정:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (파일: ${r.changed_files.join(', ')})`).join('\n')}

git diff를 직접 읽어라. 다음을 물어라: 이 변경이 진단에 적힌 메커니즘을 해결하는가, 아니면 겉으로 드러난 증상을 가리는가? 같은 근본 원인이 다른 코드 경로로 다시 나타날 수 있는가? 약화되거나, 스킵되거나, 삭제된 테스트가 있는가? 이 변경이 아래 포크 가드레일과 일관되는가?
${FORK_GUARDRAILS}
확신이 서지 않으면 기본값으로 root_cause_fixed=false로 둬라.`,
    { label: 'skeptic', phase: '리뷰', schema: REVIEW_SCHEMA }
  )
}

// ---------------------------------------------------------------------------
// 결과
// ---------------------------------------------------------------------------
const solved = !!(verify.green && verify.problem_resolved && verify.guardrail_violations.length === 0)
log(solved ? '문제가 해결되었고 그린으로 검증되었다.' : '완전히 해결되지 않았다 — remaining_failures를 확인해라.')

return {
  outcome: solved ? (review && !review.root_cause_fixed ? 'green-but-symptom-patch-suspected' : 'solved') : 'unresolved',
  diagnosis: triage.diagnosis,
  evidence: triage.evidence,
  fixes: fixReports.map(r => ({ owner: r.owner, summary: r.summary, files: r.changed_files, concerns: r.concerns || '' })),
  verification: {
    pytest: verify.pytest_summary,
    ruff_clean: verify.ruff_clean,
    problem_resolved: verify.problem_resolved,
    remaining_failures: verify.failures,
    guardrail_violations: verify.guardrail_violations,
  },
  review: review ? { root_cause_fixed: review.root_cause_fixed, verdict: review.verdict, residual_risks: review.residual_risks || [] } : null,
  note: '아무것도 커밋되지 않았다. diff를 검토하고 만족스러우면 직접 커밋해라.',
}
