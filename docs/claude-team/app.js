const OWNER = "nfbs2000";
const REPO = "speaky-TradingAgents";
const BRANCH = "main";
const TREE_API = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
const GITHUB_BLOB = `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/`;

const FALLBACK_PATHS = [
  ".claude/TEAM.md",
  ".claude/agents/ta-agent-smith.md",
  ".claude/agents/ta-data-engineer.md",
  ".claude/agents/ta-evaluator.md",
  ".claude/agents/ta-fundamentals-analyst.md",
  ".claude/agents/ta-graph-engineer.md",
  ".claude/agents/ta-lead.md",
  ".claude/agents/ta-llm-engineer.md",
  ".claude/agents/ta-maintainer.md",
  ".claude/agents/ta-market-analyst.md",
  ".claude/agents/ta-memory-engineer.md",
  ".claude/agents/ta-news-sentiment-analyst.md",
  ".claude/agents/ta-risk-trader.md",
  ".claude/skills/ta-agent-creator/SKILL.md",
  ".claude/skills/ta-agent-creator/references/templates.md",
  ".claude/skills/ta-data-tools/SKILL.md",
  ".claude/skills/ta-data-tools/references/dataflows.md",
  ".claude/skills/ta-eval-backtest/SKILL.md",
  ".claude/skills/ta-eval-backtest/references/evaluation_guide.md",
  ".claude/skills/ta-eval-backtest/scripts/run_single_eval.py",
  ".claude/skills/ta-llm-config/SKILL.md",
  ".claude/skills/ta-llm-config/references/providers.md",
  ".claude/skills/ta-memory-manager/SKILL.md",
  ".claude/skills/ta-memory-manager/references/memory_internals.md",
  ".claude/skills/ta-prompt-engineer/SKILL.md",
  ".claude/skills/ta-prompt-engineer/references/agent_map.md",
  ".claude/skills/ta-team-analysis/SKILL.md",
  ".claude/skills/ta-workflow-editor/SKILL.md",
  ".claude/skills/ta-workflow-editor/references/graph_structure.md",
  ".claude/skills/upstream-sync/SKILL.md",
  ".claude/skills/upstream-sync/scripts/upstream-sync.sh",
  ".claude/team-runs/2026-08-01-NVDA/01-technical-analysis.md",
  ".claude/team-runs/2026-08-01-NVDA/02-fundamentals-analysis.md",
  ".claude/team-runs/2026-08-01-NVDA/03-news-sentiment-analysis.md",
  ".claude/team-runs/2026-08-01-NVDA/04-risk-trade-decision.md",
  ".claude/team-runs/2026-08-01-NVDA/05-final-report.md",
  ".claude/team-runs/2026-08-01-NVDA/EXECUTION-FLOW.md",
  ".claude/workflows/ta-problem-solver.js",
];

const groupOrder = [
  ["team", "팀 정의"],
  ["skills", "스킬 본문"],
  ["skill-support", "스킬 참조/스크립트"],
  ["agents", "에이전트"],
  ["workflows", "워크플로"],
  ["runs", "팀 런"],
];

const state = {
  paths: [],
  activePath: "",
};

function displayName(path) {
  return path
    .replace(".claude/", "")
    .replace("/SKILL.md", "")
    .replace("team-runs/", "");
}

function classify(path) {
  if (path === ".claude/TEAM.md") return "team";
  if (path.startsWith(".claude/agents/")) return "agents";
  if (path.startsWith(".claude/workflows/")) return "workflows";
  if (path.startsWith(".claude/team-runs/")) return "runs";
  if (path.startsWith(".claude/skills/") && path.endsWith("/SKILL.md")) return "skills";
  if (path.startsWith(".claude/skills/")) return "skill-support";
  return "other";
}

function isPublicClaudeFile(path) {
  return path.startsWith(".claude/")
    && path !== ".claude/scheduled_tasks.lock"
    && !path.endsWith("/")
    && [".md", ".js", ".py", ".sh"].some((extension) => path.endsWith(extension));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function ensureViewerVisible() {
  const viewer = document.querySelector(".viewer");
  if (!viewer) return;

  const rect = viewer.getBoundingClientRect();
  const narrow = window.matchMedia("(max-width: 980px)").matches;
  const outsideFocusBand = rect.top < 72 || rect.top > window.innerHeight * 0.65;
  if (narrow || outsideFocusBand) {
    const topbar = document.querySelector(".topbar");
    const offset = (topbar?.getBoundingClientRect().height || 64) + 16;
    window.scrollTo({
      top: Math.max(0, window.pageYOffset + rect.top - offset),
      behavior: "smooth",
    });
  }
}

async function loadTree() {
  try {
    const response = await fetch(TREE_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub tree API HTTP ${response.status}`);
    const data = await response.json();
    return data.tree
      .filter((item) => item.type === "blob")
      .map((item) => item.path)
      .filter(isPublicClaudeFile)
      .sort();
  } catch (error) {
    console.warn(error);
    return FALLBACK_PATHS.slice().sort();
  }
}

function setStats(paths) {
  const stats = {
    skills: paths.filter((path) => classify(path) === "skills").length,
    agents: paths.filter((path) => classify(path) === "agents").length,
    workflows: paths.filter((path) => classify(path) === "workflows").length,
    runs: new Set(paths
      .filter((path) => classify(path) === "runs")
      .map((path) => path.split("/").slice(2, 3).join(""))).size,
  };

  const values = document.querySelectorAll("#stats .stat-value");
  values[0].textContent = stats.skills;
  values[1].textContent = stats.agents;
  values[2].textContent = stats.workflows;
  values[3].textContent = stats.runs;
}

function renderGroups(paths) {
  const root = document.querySelector("#file-groups");
  const grouped = new Map(groupOrder.map(([key]) => [key, []]));
  for (const path of paths) {
    const group = classify(path);
    if (grouped.has(group)) grouped.get(group).push(path);
  }

  root.innerHTML = groupOrder.map(([key, label]) => {
    const files = grouped.get(key);
    if (!files.length) return "";
    const buttons = files.map((path) => `
      <button class="file-button" type="button" data-path="${escapeHtml(path)}">
        ${escapeHtml(displayName(path))}
      </button>
    `).join("");
    return `
      <section class="group">
        <h3>${label} <span class="status-note">${files.length}</span></h3>
        <div class="file-list">${buttons}</div>
      </section>
    `;
  }).join("");

  root.querySelectorAll(".file-button").forEach((button) => {
    button.addEventListener("click", () => selectFile(button.dataset.path));
  });
}

function renderRuns(paths) {
  const runRoot = document.querySelector("#run-map");
  const runs = new Map();
  for (const path of paths.filter((item) => item.startsWith(".claude/team-runs/"))) {
    const [, , runName] = path.split("/");
    if (!runs.has(runName)) runs.set(runName, []);
    runs.get(runName).push(path);
  }

  if (!runs.size) {
    runRoot.innerHTML = `<p class="loading">아직 커밋된 팀 런이 없습니다.</p>`;
    return;
  }

  runRoot.innerHTML = Array.from(runs.entries()).sort().reverse().map(([runName, files]) => {
    const final = files.find((path) => path.endsWith("05-final-report.md"));
    const flow = files.find((path) => path.endsWith("EXECUTION-FLOW.md"));
    const reports = files.filter((path) => /0[1-4]-.*\.md$/.test(path)).length;
    return `
      <article class="run-card">
        <p class="eyebrow">RUN</p>
        <h3>${escapeHtml(runName)}</h3>
        <ul>
          <li>산출물 ${files.length}개, 분석 리포트 ${reports}개</li>
          <li>${final ? `<button class="file-button inline" type="button" data-path="${escapeHtml(final)}">최종 리포트 열기</button>` : "최종 리포트 없음"}</li>
          <li>${flow ? `<button class="file-button inline" type="button" data-path="${escapeHtml(flow)}">실행 흐름 열기</button>` : "실행 흐름 없음"}</li>
        </ul>
      </article>
    `;
  }).join("");

  runRoot.querySelectorAll(".file-button").forEach((button) => {
    button.addEventListener("click", () => selectFile(button.dataset.path));
  });
}

async function selectFile(path, options = {}) {
  const { focusViewer = true } = options;
  state.activePath = path;
  document.querySelectorAll(".file-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.path === path);
  });

  const title = document.querySelector("#viewer-title");
  const content = document.querySelector("#file-content");
  const link = document.querySelector("#github-link");
  title.textContent = displayName(path);
  link.href = `${GITHUB_BLOB}${path}`;
  content.textContent = "파일을 불러오는 중입니다.";
  content.scrollTop = 0;
  if (focusViewer) ensureViewerVisible();

  try {
    const response = await fetch(`${RAW_BASE}${path}`);
    if (!response.ok) throw new Error(`raw fetch HTTP ${response.status}`);
    content.textContent = await response.text();
    content.scrollTop = 0;
  } catch (error) {
    content.textContent = `파일을 불러오지 못했습니다.\n${error.message}\n\nGitHub에서 직접 열어 확인하세요:\n${link.href}`;
    content.scrollTop = 0;
  }
}

async function main() {
  const paths = await loadTree();
  state.paths = paths;
  setStats(paths);
  renderGroups(paths);
  renderRuns(paths);

  const preferred =
    paths.find((path) => path.endsWith("team-runs/2026-08-01-NVDA/05-final-report.md"))
    || paths.find((path) => path === ".claude/TEAM.md")
    || paths[0];
  if (preferred) await selectFile(preferred, { focusViewer: false });
}

main().catch((error) => {
  document.querySelector("#file-groups").innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
