"""Evidence gate for `.claude` runtime team runs.

The runtime team (`.claude/agents/ta-*.md`, orchestrated by the
`ta-team-analysis` skill or the `ta-team-run` workflow) writes its artifacts to
``.claude/team-runs/{DATE}-{TICKER}/``. This module is the gate that decides
whether such a run counts: every exact number a report claims must trace back
to a repo tool call, and every contract file must round-trip through the
product's own Pydantic schemas.

These assertions are deliberately *behavioural*, not textual. A grep for
"verified close" would pass on a report that invented the number; instead we
re-invoke the repo tool and compare. Change a digit in a report and these
tests fail — that is the property that makes them worth running.

Point the gate at a run with::

    TEAM_RUN_DIR=.claude/team-runs/2026-08-04-NVDA pytest tests/test_claude_team_artifacts.py

With no env var the newest directory under ``.claude/team-runs/`` is used.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pytest

from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioRating,
    ResearchPlan,
    TraderProposal,
    render_pm_decision,
    render_research_plan,
    render_trader_proposal,
)
from tradingagents.agents.utils.rating import parse_rating

REPO_ROOT = Path(__file__).resolve().parents[1]
TEAM_RUNS = REPO_ROOT / ".claude" / "team-runs"

# Stage files the gate requires. Analyst reports carry a verdict line; the
# three contract files carry an embedded schema payload.
ANALYST_FILES = (
    "01-technical-analysis.md",
    "02-sentiment-analysis.md",
    "03-news-analysis.md",
    "04-fundamentals-analysis.md",
)
CONTRACT_FILES = {
    "06-research-plan.md": (ResearchPlan, render_research_plan),
    "07-trader-proposal.md": (TraderProposal, render_trader_proposal),
    "12-portfolio-decision.md": (PortfolioDecision, render_pm_decision),
}

# Contract files embed their structured payload in an HTML comment so the
# markdown stays readable while remaining machine-checkable. The delimiter is
# an HTML comment for the same reason the memory log uses one: prose cannot
# accidentally produce it.
_SCHEMA_BLOCK_RE = re.compile(
    r"<!--\s*SCHEMA:(?P<name>\w+)\s*(?P<json>\{.*?\})\s*-->",
    re.DOTALL,
)


def _newest_run() -> Path:
    if not TEAM_RUNS.is_dir():
        pytest.skip(f"no team-runs directory at {TEAM_RUNS}")
    runs = sorted(p for p in TEAM_RUNS.iterdir() if p.is_dir())
    if not runs:
        pytest.skip("no team runs to check")
    return runs[-1]


@pytest.fixture(scope="module")
def run_dir() -> Path:
    override = os.environ.get("TEAM_RUN_DIR")
    path = (REPO_ROOT / override) if override else _newest_run()
    if not path.is_dir():
        pytest.fail(f"TEAM_RUN_DIR does not exist: {path}")
    return path


@pytest.fixture(scope="module")
def ticker_and_date(run_dir: Path) -> tuple[str, str]:
    """Recover the run's ticker and analysis date from the repo tool's own output.

    Deliberately *not* the directory name. The directory is a run label chosen
    by whoever launched the run — a re-run of the same analysis date gets a
    different label — so it does not identify what was analysed. The analysis
    date the tools were actually called with is echoed by the tool itself in
    ``00-market-data.md`` ("Requested analysis date: ..."), and that is the
    only value the gate can hold the report to.
    """
    text = _read(run_dir, "00-market-data.md")
    date = re.search(r"Requested analysis date:\s*(\d{4}-\d{2}-\d{2})", text)
    ticker = re.search(r"^#\s*Repo-tool market data\s*—\s*([A-Z.\-]+)\s*@", text, re.MULTILINE)
    if not date:
        pytest.fail("00-market-data.md has no 'Requested analysis date:' line from the repo tool")
    if not ticker:
        pytest.fail("00-market-data.md has no '# Repo-tool market data — TICKER @ DATE' header")
    return ticker.group(1), date.group(1)


def _read(run_dir: Path, name: str) -> str:
    path = run_dir / name
    if not path.is_file():
        pytest.fail(f"missing required artifact: {path}")
    return path.read_text(encoding="utf-8")


def _schema_payload(text: str, path: Path) -> tuple[str, dict]:
    m = _SCHEMA_BLOCK_RE.search(text)
    if not m:
        pytest.fail(f"{path.name} has no <!-- SCHEMA:Name {{...}} --> payload block")
    try:
        return m.group("name"), json.loads(m.group("json"))
    except json.JSONDecodeError as exc:
        pytest.fail(f"{path.name} schema payload is not valid JSON: {exc}")


def _markdown_body(text: str) -> str:
    """The rendered markdown, i.e. everything after the schema payload block."""
    return _SCHEMA_BLOCK_RE.sub("", text, count=1).strip()


# ---------------------------------------------------------------------------
# 1. Every claimed number traces back to a repo tool call
# ---------------------------------------------------------------------------


def test_market_data_matches_repo_tool_output(run_dir: Path, ticker_and_date):
    """The recorded close must equal what the repo tool returns right now.

    Falsifiability: change a digit of the close in 00-market-data.md and this
    fails. It is not checking that the text mentions a close — it recomputes
    the value from the product's own verification tool and compares.
    """
    ticker, date = ticker_and_date
    from tradingagents.agents.utils.agent_utils import get_verified_market_snapshot

    fresh = get_verified_market_snapshot.invoke(
        {"symbol": ticker, "curr_date": date, "look_back_days": 30}
    )
    expected = re.search(r"\|\s*Close\s*\|\s*([\d.]+)\s*\|", fresh)
    assert expected, "repo tool output has no Close row — tool contract changed"

    recorded = _read(run_dir, "00-market-data.md")
    found = re.search(r"\|\s*Close\s*\|\s*([\d.]+)\s*\|", recorded)
    assert found, "00-market-data.md has no Close row"
    assert found.group(1) == expected.group(1), (
        f"recorded close {found.group(1)} != repo tool close {expected.group(1)}"
    )


def test_analyst_numbers_appear_in_tool_call_log(run_dir: Path):
    """Exact prices quoted by the technical analyst must appear in a tool log.

    This is the evidence-traceability rule: a number in a report that no tool
    call produced is fabricated, and the run does not count.
    """
    log_dir = run_dir / "tool-calls"
    if not log_dir.is_dir():
        pytest.fail(f"missing tool-call log directory: {log_dir}")
    logged = "\n".join(
        p.read_text(encoding="utf-8", errors="replace") for p in log_dir.rglob("*")
        if p.is_file()
    )
    assert logged.strip(), "tool-call log directory is empty"

    report = _read(run_dir, "01-technical-analysis.md")
    # Two-decimal figures are price/indicator claims; integers and percentages
    # are excluded because they are usually derived (counts, ratios, changes).
    claimed = {m.group(1) for m in re.finditer(r"\$?(\d{2,5}\.\d{2})\b", report)}
    unsupported = sorted(n for n in claimed if n not in logged)
    assert not unsupported, (
        f"{len(unsupported)} number(s) in 01-technical-analysis.md have no tool-call "
        f"evidence: {unsupported[:10]}"
    )


# ---------------------------------------------------------------------------
# 2. Contract files round-trip through the product's schemas
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("filename", sorted(CONTRACT_FILES))
def test_contract_file_round_trips_through_schema(run_dir: Path, filename: str):
    """Payload validates against the Pydantic model AND re-renders identically.

    Falsifiability: drop a required field, use a rating outside the 5-tier
    enum, or let the markdown drift from the payload, and this fails.
    """
    model, renderer = CONTRACT_FILES[filename]
    text = _read(run_dir, filename)
    name, payload = _schema_payload(text, run_dir / filename)
    assert name == model.__name__, (
        f"{filename} declares SCHEMA:{name} but must be SCHEMA:{model.__name__}"
    )

    instance = model.model_validate(payload)
    assert renderer(instance) == _markdown_body(text), (
        f"{filename} markdown does not match its schema payload — "
        "the rendered body must be exactly what the product renderer produces"
    )


def test_portfolio_rating_is_recoverable_by_product_parser(run_dir: Path):
    """`parse_rating` must recover the PM's rating from the rendered markdown.

    This is the pipeline-compatibility claim made concrete: the same parser the
    product uses on its own Portfolio Manager output has to work here.
    """
    text = _read(run_dir, "12-portfolio-decision.md")
    _, payload = _schema_payload(text, run_dir / "12-portfolio-decision.md")
    declared = PortfolioDecision.model_validate(payload).rating

    recovered = parse_rating(_markdown_body(text), default="__missing__")
    assert recovered == declared.value, (
        f"parse_rating recovered {recovered!r}, payload declares {declared.value!r}"
    )
    assert recovered in {r.value for r in PortfolioRating}


# ---------------------------------------------------------------------------
# 3. Stage completeness — defends against the pipeline's own silent-skip bug
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("filename", ANALYST_FILES)
def test_analyst_report_is_substantive(run_dir: Path, filename: str):
    """Non-empty with a verdict line.

    The product lets an analyst report stay an empty string when the model
    keeps calling tools (market_analyst.py:87-88), and the report writer then
    skips the section silently (reporting.py:22-37). The team must not.
    """
    text = _read(run_dir, filename)
    assert len(text.strip()) > 500, f"{filename} is too short to be a real report"
    assert re.search(r"^##\s+\w[\w /]*:\s*\*\*.+\*\*\s*$", text, re.MULTILINE), (
        f"{filename} has no '## <Verdict Name>: **value**' line"
    )


def test_debate_history_contains_both_sides(run_dir: Path):
    """Bull and Bear must both have spoken, with the product's routing prefixes.

    The prefixes are a real contract: conditional_logic.py:59 routes on
    `current_response.startswith("Bull")`.
    """
    text = _read(run_dir, "05-debate-history.md")
    assert "Bull Analyst:" in text, "no Bull Analyst turn in debate history"
    assert "Bear Analyst:" in text, "no Bear Analyst turn in debate history"
    assert text.index("Bull Analyst:") < text.index("Bear Analyst:"), (
        "Bear must rebut Bull — Bull's turn has to come first"
    )


def test_risk_debate_covers_all_three_seats(run_dir: Path):
    """Aggressive, Conservative, Neutral each speak once, in the product's rotation.

    conditional_logic.py:69-73 rotates Aggressive → Conservative → Neutral.
    """
    text = _read(run_dir, "11-risk-history.md")
    order = ["Aggressive Analyst:", "Conservative Analyst:", "Neutral Analyst:"]
    positions = []
    for label in order:
        assert label in text, f"no {label} turn in risk history"
        positions.append(text.index(label))
    assert positions == sorted(positions), (
        f"risk rotation must be {' → '.join(order)}, got a different order"
    )


def test_run_ledger_names_this_run(run_dir: Path):
    """The ledger's first line must name this run, not another one.

    A ledger whose first line points elsewhere is someone else's progress; the
    orchestrator must not resume from it.
    """
    text = _read(run_dir, "progress.md")
    first = text.strip().splitlines()[0] if text.strip() else ""
    assert run_dir.name in first, (
        f"progress.md first line must name {run_dir.name}, got {first!r}"
    )
