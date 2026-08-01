export const meta = {
  name: 'ta-problem-solver',
  description: 'Triage a TradingAgents problem, route the fix to the owning ta-* specialists, verify until green',
  whenToUse: 'Any problem in this repo — a bug, a failing test, a regression, "X stopped working", post-merge breakage. Triage reproduces and localizes it, the owning specialist fixes it, ta-maintainer verifies against the 576-test baseline, and a skeptic confirms the root cause. Pass the problem via args: {problem: "...", repro: "optional command", context: "optional extra detail"}.',
  phases: [
    { title: 'Triage', detail: 'reproduce, localize, route to owners' },
    { title: 'Fix', detail: 'owning ta-* specialists apply the fix in ownership order' },
    { title: 'Verify', detail: 'pytest + ruff + fork guardrails, repair loop until green' },
    { title: 'Review', detail: 'adversarial root-cause check' },
  ],
}

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------
const input = typeof args === 'string' ? { problem: args } : (args || {})
if (!input.problem) {
  throw new Error(
    'ta-problem-solver needs a problem statement. ' +
    'Invoke with args: {problem: "<what is broken>", repro: "<optional repro command>", context: "<optional detail>"}'
  )
}

const MAX_REPAIR_ROUNDS = 2 // triage-fix + up to 2 repair rounds before giving up

// The seven dev/maintenance specialists a fix can be routed to. Each agent
// definition loads its own .claude/skills/* skill as its first action.
const SPECIALISTS = [
  'ta-agent-smith',    // agent files, prompts, agents/schemas.py, rating vocabulary
  'ta-graph-engineer', // graph/setup.py, conditional_logic.py, routing, path maps, checkpoints
  'ta-data-engineer',  // agents/utils/*_tools.py, dataflows/, vendors, indicators
  'ta-llm-engineer',   // llm_clients/, provider/model config, _get_provider_kwargs
  'ta-memory-engineer',// agents/utils/memory.py, graph/reflection.py, trading_memory.md
  'ta-evaluator',      // run/result analysis, full_states_log JSON, cost
  'ta-maintainer',     // upstream merge fallout, drift, baseline health
]

const ROUTING_TABLE = `
Route by the artifact that must change, not by topic words:
- prompt text, system_message, agents/schemas.py, a new/broken agent -> ta-agent-smith
- graph/setup.py, conditional_logic.py, analyst_execution.py, node names, debate rounds, checkpointing -> ta-graph-engineer
- agents/utils/*_tools.py, dataflows/, vendors, indicators, macro/sentiment sources -> ta-data-engineer
- llm_clients/, provider/model choice, reasoning-effort/thinking knobs, _get_provider_kwargs -> ta-llm-engineer
- agents/utils/memory.py, graph/reflection.py, trading_memory.md, benchmark/realized-return logic -> ta-memory-engineer
- interpreting run output, comparing configs, full_states_log_*.json -> ta-evaluator
- upstream-merge fallout, "baseline was green before the merge", skill drift symptoms -> ta-maintainer

Ownership sequencing rules (violating these is itself a bug):
- tool must exist and route (ta-data-engineer) BEFORE it is bound in a ToolNode (ta-graph-engineer) BEFORE a prompt names it (ta-agent-smith)
- rating vocabulary spans rating.py, schemas.py, signal_processing.py -> one owner, ta-agent-smith, never split
- anything after an upstream merge starts with ta-maintainer's drift check
`

const ENV_CONTRACT = `
Environment contract (all verification depends on these):
- Use python3 — there is no python shim on this machine.
- If "import tradingagents.graph.*" fails on yfinance, run: pip install -e ".[dev]" first (a venv is fine).
- Test baseline: 576 passed, 2 skipped (test_bedrock_provider.py, test_deepseek_reasoning.py). ruff check . passes clean.
- NEVER run the paid LLM pipeline or a backtest sweep — verify by tests only.
- Do NOT edit .claude/skills/** — if a skill misdescribes the code, report the drift instead.
- Do NOT commit or push.
`

const FORK_GUARDRAILS = `
Fork-specific guardrails — reject/flag any change that contains:
- create_x(llm, memory) — no factory takes a memory argument here
- FinancialSituationMemory, BM25, reflect_and_remember() — none exist
- "Risk Manager" as the risk judge — it is the Portfolio Manager
- social_media_analyst as a live agent — deprecated alias for sentiment_analyst (wire key "social")
- BUY/SELL/HOLD as the pipeline signal — it is 5-tier Title-case Buy/Overweight/Hold/Underweight/Sell
- a {ticker} prompt variable — identity arrives via {instrument_context}
- a prompt without + get_language_instruction()
- a new router return value with no matching DEBATE_PATH_MAP / RISK_ANALYSIS_PATH_MAP entry
- eval_results/ as the log path — logs go under results_dir (~/.tradingagents/logs)
`

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['reproduced', 'diagnosis', 'fix_needed', 'plan'],
  properties: {
    reproduced: { type: 'boolean', description: 'whether the problem was reproduced (or confirmed from evidence)' },
    repro_command: { type: 'string', description: 'exact command that demonstrates the problem, empty if none' },
    evidence: { type: 'string', description: 'the actual error output / failing assertion / observed wrong behavior' },
    diagnosis: { type: 'string', description: 'root-cause hypothesis: which file/function is wrong and why' },
    fix_needed: { type: 'boolean', description: 'false if this is a question/misunderstanding needing no code change' },
    plan: {
      type: 'array',
      description: 'ordered fix tasks, one per owning specialist, in ownership-sequence order (may be empty if fix_needed is false)',
      items: {
        type: 'object',
        required: ['owner', 'task'],
        properties: {
          owner: { type: 'string', enum: SPECIALISTS },
          task: { type: 'string', description: 'imperative task: the files to touch, the change, the acceptance check, what NOT to touch' },
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
    summary: { type: 'string', description: 'what changed and why it fixes the root cause' },
    changed_files: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'string', description: 'anything left uncertain, empty if none' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['green', 'pytest_summary', 'ruff_clean', 'problem_resolved', 'failures', 'guardrail_violations'],
  properties: {
    green: { type: 'boolean', description: 'true only if pytest matches the 576/2 baseline AND ruff is clean' },
    pytest_summary: { type: 'string', description: 'the actual pytest tail line, e.g. "576 passed, 2 skipped"' },
    ruff_clean: { type: 'boolean' },
    problem_resolved: { type: 'boolean', description: 'true if the original repro/evidence no longer occurs' },
    failures: {
      type: 'array',
      description: 'remaining failures, empty when green',
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
    root_cause_fixed: { type: 'boolean', description: 'false if the change only suppresses the symptom' },
    verdict: { type: 'string', description: 'one-paragraph judgment with the strongest objection you found' },
    residual_risks: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// Phase 1 — Triage: reproduce, localize, route
// ---------------------------------------------------------------------------
phase('Triage')
log(`Triaging: ${input.problem}`)

const triage = await agent(
  `You are triaging a reported problem in the TradingAgents repo at /Users/realpio/Documents/speaky-TradingAgents.

PROBLEM: ${input.problem}
${input.repro ? `REPORTED REPRO: ${input.repro}` : ''}
${input.context ? `EXTRA CONTEXT: ${input.context}` : ''}

Follow systematic debugging discipline — evidence before hypotheses, reproduce before fixing:
1. REPRODUCE: run the reported repro if given; otherwise run the narrowest command that should expose it (a targeted pytest, an import, a CLI invocation). Capture the real error output. If the problem only manifests in the paid pipeline, do NOT run it — reason from code and tests instead and say so.
2. BASELINE: check whether the suite is already red (pytest -q tail is enough). Expected baseline: 576 passed, 2 skipped.
3. LOCALIZE: read the failing code path (Grep/Read) until you can name the file and function that is wrong, and why.
4. ROUTE: assign each needed change to its owning specialist using this table, in ownership-sequence order:
${ROUTING_TABLE}
${ENV_CONTRACT}
Each plan task description must be self-contained: name the exact files, the change, the acceptance check, and what must NOT be touched. If the problem turns out to be a misunderstanding or a question (no code is wrong), set fix_needed=false and explain in diagnosis.`,
  { label: 'triage', phase: 'Triage', schema: TRIAGE_SCHEMA }
)

if (!triage) throw new Error('Triage agent died — nothing to act on.')
log(`Diagnosis: ${triage.diagnosis}`)

if (!triage.fix_needed || triage.plan.length === 0) {
  return {
    outcome: 'no-fix-needed',
    reproduced: triage.reproduced,
    diagnosis: triage.diagnosis,
    evidence: triage.evidence,
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Fix: dispatch owning specialists sequentially (ownership order)
// ---------------------------------------------------------------------------
phase('Fix')
const fixReports = []
for (const [i, task] of triage.plan.entries()) {
  const owner = SPECIALISTS.includes(task.owner) ? task.owner : 'ta-maintainer'
  log(`Fix ${i + 1}/${triage.plan.length} -> ${owner}`)
  const prior = fixReports.length
    ? `\nWork already done by teammates this run:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (files: ${r.changed_files.join(', ')})`).join('\n')}`
    : ''
  const report = await agent(
    `Load your skill first, then fix this. You are working a triaged problem; do exactly your task, nothing else.

ORIGINAL PROBLEM: ${input.problem}
ROOT-CAUSE DIAGNOSIS: ${triage.diagnosis}
EVIDENCE: ${triage.evidence}
${triage.repro_command ? `REPRO COMMAND: ${triage.repro_command}` : ''}
YOUR TASK: ${task.task}
${prior}
${ENV_CONTRACT}
${FORK_GUARDRAILS}
Fix the ROOT CAUSE, not the symptom — do not weaken or delete a failing test to make it pass. After editing, run the narrowest relevant check (targeted pytest + ruff on touched files). Report honestly: if something does not work, say so in concerns.`,
    { label: `fix:${owner}`, phase: 'Fix', agentType: owner, schema: FIX_SCHEMA }
  )
  if (report) fixReports.push({ owner, ...report })
  else log(`WARNING: ${owner} returned nothing — verification will catch any gap`)
}

// ---------------------------------------------------------------------------
// Phase 3 — Verify: full baseline + guardrails, repair loop until green
// ---------------------------------------------------------------------------
const verifyPrompt = (round) =>
  `Load your skill first. Verify the repo after a fix (verification round ${round}).

ORIGINAL PROBLEM: ${input.problem}
${triage.repro_command ? `ORIGINAL REPRO: ${triage.repro_command} — rerun it and confirm the problem is gone.` : 'Confirm from the evidence that the original problem is resolved.'}
ORIGINAL EVIDENCE: ${triage.evidence}
CLAIMED FIXES:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (files: ${r.changed_files.join(', ')})`).join('\n')}

Do not take the claims on faith:
1. git diff — read every change yourself.
2. pytest -q — full suite. green means EXACTLY the baseline: 576 passed, 2 skipped (plus any tests the fix legitimately added — count them and say so).
3. ruff check . — must be clean.
4. Screen the diff against these fork guardrails and list any violation:
${FORK_GUARDRAILS}
${ENV_CONTRACT}
For every remaining failure, name the suspected owning specialist using:
${ROUTING_TABLE}`

phase('Verify')
let verify = null
for (let round = 1; round <= MAX_REPAIR_ROUNDS + 1; round++) {
  verify = await agent(verifyPrompt(round), {
    label: `verify:round${round}`, phase: 'Verify', agentType: 'ta-maintainer', schema: VERIFY_SCHEMA,
  })
  if (!verify) throw new Error('Verification agent died — repo state unknown, stopping.')
  log(`Verify round ${round}: ${verify.pytest_summary}, ruff ${verify.ruff_clean ? 'clean' : 'DIRTY'}, resolved=${verify.problem_resolved}`)

  if (verify.green && verify.problem_resolved && verify.guardrail_violations.length === 0) break
  if (round > MAX_REPAIR_ROUNDS) break

  const issues = [
    ...verify.failures.map(f => ({ owner: f.suspected_owner, text: `${f.what}: ${f.error}` })),
    ...verify.guardrail_violations.map(v => ({ owner: triage.plan[0].owner, text: `guardrail violation: ${v}` })),
    ...(!verify.problem_resolved ? [{ owner: triage.plan[0].owner, text: `original problem still reproduces: ${triage.evidence}` }] : []),
  ]
  // group repairs by owner so each specialist gets one consolidated pass
  const byOwner = {}
  for (const it of issues) {
    const o = SPECIALISTS.includes(it.owner) ? it.owner : 'ta-maintainer'
    ;(byOwner[o] = byOwner[o] || []).push(it.text)
  }
  for (const [owner, list] of Object.entries(byOwner)) {
    log(`Repair round ${round} -> ${owner} (${list.length} issue(s))`)
    const repair = await agent(
      `Load your skill first. Your team's fix for "${input.problem}" did not fully pass verification. Repair the following, root cause only — never weaken tests to pass:
${list.map(t => `- ${t}`).join('\n')}
Context — diagnosis: ${triage.diagnosis}
Changes so far: ${fixReports.map(r => `${r.owner}: ${r.changed_files.join(', ')}`).join(' | ')}
${ENV_CONTRACT}
${FORK_GUARDRAILS}
After editing, run the narrowest relevant check yourself before reporting.`,
      { label: `repair:${owner}`, phase: 'Verify', agentType: owner, schema: FIX_SCHEMA }
    )
    if (repair) fixReports.push({ owner, ...repair })
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — Review: adversarial root-cause check (only when green)
// ---------------------------------------------------------------------------
let review = null
if (verify.green && verify.problem_resolved) {
  phase('Review')
  review = await agent(
    `Adversarial review. A problem in the TradingAgents repo was just "fixed" and the test suite is green. Your job is to REFUTE the fix — assume it is a symptom patch until the diff proves otherwise.

PROBLEM: ${input.problem}
DIAGNOSIS: ${triage.diagnosis}
EVIDENCE: ${triage.evidence}
FIXES APPLIED:\n${fixReports.map(r => `- ${r.owner}: ${r.summary} (files: ${r.changed_files.join(', ')})`).join('\n')}

Read the git diff yourself. Ask: does the change address the mechanism in the diagnosis, or does it mask the observable symptom? Could the same root cause resurface through another code path? Were any tests weakened, skipped, or deleted? Is the change consistent with the fork guardrails below?
${FORK_GUARDRAILS}
Default to root_cause_fixed=false if you are uncertain.`,
    { label: 'skeptic', phase: 'Review', schema: REVIEW_SCHEMA }
  )
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
const solved = !!(verify.green && verify.problem_resolved && verify.guardrail_violations.length === 0)
log(solved ? 'Problem solved and verified green.' : 'NOT fully resolved — see remaining_failures.')

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
  note: 'Nothing was committed. Review the diff and commit yourself if satisfied.',
}
