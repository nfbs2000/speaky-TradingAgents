"""저장소 툴 러너 — 계산 로직은 여기에 하나도 없다.

이 파일이 하는 일은 저장소가 이미 제공하는 데이터 툴을 그대로 호출하고 그 출력을
**가공 없이** 파일에 쓰는 것뿐이다. 제품 에이전트들이 쓰는 바로 그 툴이므로 벤더
라우팅, 캐시, 지표 계산, look-ahead 필터가 전부 저장소 설정을 그대로 따른다.

기본 벤더 설정에서 여기 호출하는 툴은 **API 키를 하나도 요구하지 않는다**.
`get_macro_indicators`만 FRED 키를 쓰는데, 키가 없으면 크래시하지 않고
``DATA_UNAVAILABLE:`` 센티넬 문자열을 돌려준다 (optional 카테고리).

여기에 pandas 가공, 자체 지표 계산, 값 보정을 추가하지 마라. 그럴 필요가 생겼다면
그것은 `tradingagents/`에 들어갈 변경이지 이 러너의 일이 아니다.

두 가지 산출물을 만든다:
  1. `00-market-data.md`      — market 스테이지 툴 출력 (사람이 읽는 정리본)
  2. `tool-calls/{NN}-{tool}.txt` — 모든 호출의 원본 출력. 증거 게이트가 리포트의
     수치를 이 로그와 대조한다.

Usage:
    <python> repo_market_data.py TICKER YYYY-MM-DD RUN_DIR [--stage STAGE]

    STAGE: market | sentiment | news | fundamentals | all   (기본 all)

Exit codes:
    0 — 작성됨
    2 — 잘못된 인자
    3 — 저장소 툴을 불러올 수 없음 (web-only degraded run으로 진행해야 함)
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

OHLCV_WINDOW_DAYS = 45   # get_stock_data 조회 시작일 오프셋 (약 30 거래일)
NEWS_WINDOW_DAYS = 30
STALE_CALENDAR_DAYS = 5

STAGES = ("market", "sentiment", "news", "fundamentals")


def _log(run_dir: Path, index: str, tool: str, output: str) -> Path:
    """툴 호출 원본 출력을 tool-calls/ 에 저장하고 경로를 돌려준다."""
    log_dir = run_dir / "tool-calls"
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{index}-{tool}.txt"
    path.write_text(output, encoding="utf-8")
    return path


def _call(run_dir: Path, index: str, tool_name: str, fn, kwargs: dict) -> str:
    """툴을 호출하고 원본 출력을 기록한다. 실패해도 런을 죽이지 않는다.

    데이터 툴 하나가 막히는 것과 저장소 툴을 아예 못 쓰는 것은 다른 사건이다.
    후자만 exit 3이고, 전자는 실패 문자열을 그대로 기록해 하류가 Data Gaps로
    다룰 수 있게 한다.
    """
    try:
        out = fn.invoke(kwargs) if hasattr(fn, "invoke") else fn(**kwargs)
    except Exception as exc:  # noqa: BLE001 — 한 툴의 실패가 전체를 막지 않는다
        out = f"TOOL_FAILED: {tool_name}: {type(exc).__name__}: {exc}"
    _log(run_dir, index, tool_name, out)
    print(f"  {index}-{tool_name}: {len(out)} chars")
    return out


def _market(run_dir: Path, ticker: str, date_str: str, requested: datetime) -> list[str]:
    from tradingagents.agents.utils.agent_utils import (
        get_indicators,
        get_stock_data,
        get_verified_market_snapshot,
    )
    from tradingagents.dataflows.market_data_validator import DEFAULT_SNAPSHOT_INDICATORS

    sections: list[str] = []

    snapshot = _call(
        run_dir, "01", "get_verified_market_snapshot", get_verified_market_snapshot,
        {"symbol": ticker, "curr_date": date_str, "look_back_days": 30},
    )
    sections.append("## Tool: `get_verified_market_snapshot`\n\n" + snapshot)

    start = (requested - timedelta(days=OHLCV_WINDOW_DAYS)).strftime("%Y-%m-%d")
    ohlcv = _call(
        run_dir, "01", "get_stock_data", get_stock_data,
        {"symbol": ticker, "start_date": start, "end_date": date_str},
    )
    sections.append(
        f"## Tool: `get_stock_data` ({start} → {date_str})\n\n```csv\n{ohlcv}\n```"
    )

    blocks = []
    for name in DEFAULT_SNAPSHOT_INDICATORS:
        blocks.append(_call(
            run_dir, "01", f"get_indicators.{name}", get_indicators,
            {"symbol": ticker, "indicator": name, "curr_date": date_str,
             "look_back_days": 30},
        ))
    sections.append(
        "## Tool: `get_indicators` (repo DEFAULT_SNAPSHOT_INDICATORS, 30-day history)\n\n"
        + "\n\n".join(blocks)
    )
    return sections


def _sentiment(run_dir: Path, ticker: str) -> None:
    from tradingagents.dataflows.reddit import fetch_reddit_posts
    from tradingagents.dataflows.stocktwits import fetch_stocktwits_messages

    _call(run_dir, "02", "fetch_stocktwits_messages", fetch_stocktwits_messages,
          {"ticker": ticker, "limit": 30})
    _call(run_dir, "02", "fetch_reddit_posts", fetch_reddit_posts, {"ticker": ticker})


def _news(run_dir: Path, ticker: str, date_str: str, requested: datetime) -> None:
    from tradingagents.agents.utils.agent_utils import (
        get_global_news,
        get_macro_indicators,
        get_news,
    )

    start = (requested - timedelta(days=NEWS_WINDOW_DAYS)).strftime("%Y-%m-%d")
    _call(run_dir, "03", "get_news", get_news,
          {"ticker": ticker, "start_date": start, "end_date": date_str})
    _call(run_dir, "03", "get_global_news", get_global_news, {"curr_date": date_str})
    # FRED 키가 없으면 DATA_UNAVAILABLE 센티넬이 그대로 기록된다 — 정상 경로다.
    _call(run_dir, "03", "get_macro_indicators", get_macro_indicators,
          {"indicator": "fed_funds_rate", "curr_date": date_str})


def _fundamentals(run_dir: Path, ticker: str, date_str: str) -> None:
    from tradingagents.agents.utils.agent_utils import (
        get_balance_sheet,
        get_cashflow,
        get_fundamentals,
        get_income_statement,
        get_insider_transactions,
    )

    _call(run_dir, "04", "get_fundamentals", get_fundamentals,
          {"ticker": ticker, "curr_date": date_str})
    for tool_name, fn in (
        ("get_balance_sheet", get_balance_sheet),
        ("get_cashflow", get_cashflow),
        ("get_income_statement", get_income_statement),
    ):
        _call(run_dir, "04", tool_name, fn,
              {"ticker": ticker, "freq": "quarterly", "curr_date": date_str})
    _call(run_dir, "04", "get_insider_transactions", get_insider_transactions,
          {"ticker": ticker})


def main() -> int:
    argv = sys.argv[1:]
    stage = "all"
    if "--stage" in argv:
        i = argv.index("--stage")
        try:
            stage = argv[i + 1]
        except IndexError:
            print("--stage needs a value", file=sys.stderr)
            return 2
        del argv[i:i + 2]

    if len(argv) != 3:
        print(__doc__.split("Usage:")[1].split("Exit codes:")[0], file=sys.stderr)
        return 2
    if stage != "all" and stage not in STAGES:
        print(f"--stage must be one of {('all',) + STAGES}, got {stage!r}", file=sys.stderr)
        return 2

    ticker, date_str, run_dir = argv[0].upper(), argv[1], Path(argv[2])
    try:
        requested = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        print(f"invalid date (want YYYY-MM-DD): {date_str}", file=sys.stderr)
        return 2

    try:
        import tradingagents.agents.utils.agent_utils  # noqa: F401
    except Exception as exc:  # noqa: BLE001 — 저장소 툴 자체를 못 쓰는 경우
        print(f"REPO TOOLS UNAVAILABLE: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3

    run_dir.mkdir(parents=True, exist_ok=True)
    wanted = STAGES if stage == "all" else (stage,)
    print(f"{ticker} @ {date_str} → {run_dir}  stages={','.join(wanted)}")

    market_sections: list[str] = []
    if "market" in wanted:
        market_sections = _market(run_dir, ticker, date_str, requested)
    if "sentiment" in wanted:
        _sentiment(run_dir, ticker)
    if "news" in wanted:
        _news(run_dir, ticker, date_str, requested)
    if "fundamentals" in wanted:
        _fundamentals(run_dir, ticker, date_str)

    if not market_sections:
        print("done (no market stage — 00-market-data.md untouched)")
        return 0

    # 가격 기준일 / stale guard — 툴이 스스로 찍은 줄을 읽을 뿐, 다시 계산하지 않는다.
    snapshot = market_sections[0]
    stale: list[str] = []
    match = re.search(r"Latest trading row used: (\d{4}-\d{2}-\d{2})", snapshot)
    if match:
        gap = (requested - datetime.strptime(match.group(1), "%Y-%m-%d")).days
        if gap > STALE_CALENDAR_DAYS:
            stale = [
                f"> **STALE OHLCV WARNING**: 최신 검증 행 {match.group(1)}이 요청일 "
                f"{date_str}보다 {gap}일 이전이다. 아래 수치를 전부 stale로 다루고 "
                "하위 리포트에 그 사실을 밝혀라.",
                "",
            ]
    else:
        stale = [
            "> **STALE OHLCV WARNING**: 최신 행 날짜를 확인하지 못했다 — 기준일 미검증.",
            "",
        ]

    header = [
        f"# Repo-tool market data — {ticker} @ {date_str}",
        "",
        "> 저장소의 데이터 툴을 그대로 호출한 출력이다. 제품 에이전트들이 쓰는 바로",
        "> 그 툴이며, 벤더 라우팅·지표 계산·look-ahead 필터가 저장소 설정을 따른다.",
        "> 이 파일의 어떤 수치에도 LLM이 관여하지 않았고, 러너가 가공한 값도 없다.",
        ">",
        "> **이 런에서 정확한 OHLCV·이동평균·RSI·MACD·Bollinger·ATR 수치의 source of",
        "> truth는 이 파일이다.** 웹 출처가 다른 값을 주면 채택하거나 평균 내지 말고",
        '> "web source mismatch"로만 기록한다.',
        ">",
        "> 모든 툴 호출의 원본 출력은 `tool-calls/` 에 있다 — 증거 게이트가 리포트의",
        "> 수치를 그 로그와 대조한다.",
        "",
        *stale,
    ]

    out_path = run_dir / "00-market-data.md"
    out_path.write_text(
        "\n".join(header) + "\n" + "\n\n---\n\n".join(market_sections) + "\n",
        encoding="utf-8",
    )

    print(f"written: {out_path}")
    if match:
        print(f"latest verified row: {match.group(1)}")
    close = re.search(r"\| Close \| ([\d.]+) \|", snapshot)
    if close:
        print(f"verified close: {close.group(1)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
