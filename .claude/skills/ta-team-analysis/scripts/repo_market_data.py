"""저장소 툴 러너 — 계산 로직은 여기에 하나도 없다.

이 파일이 하는 일은 저장소가 이미 제공하는 `@tool` 3개를 그대로 호출하고
그 출력을 **가공 없이** 파일에 이어붙이는 것뿐이다:

    tradingagents.agents.utils.agent_utils.get_verified_market_snapshot
    tradingagents.agents.utils.agent_utils.get_stock_data
    tradingagents.agents.utils.agent_utils.get_indicators

제품의 market_analyst(`tradingagents/agents/analysts/market_analyst.py`)가 쓰는
바로 그 세 툴이다. 따라서 벤더 라우팅, 캐시, 지표 계산, look-ahead 필터가 전부
저장소 설정을 그대로 따른다. 지표 목록도 저장소 상수
(`DEFAULT_SNAPSHOT_INDICATORS`)를 그대로 쓴다 — 여기서 따로 정의하지 않는다.

여기에 pandas 가공, 자체 지표 계산, 값 보정을 추가하지 마라. 그럴 필요가
생겼다면 그것은 `tradingagents/`에 들어갈 변경이지 이 러너의 일이 아니다.

Usage:
    <python> repo_market_data.py TICKER YYYY-MM-DD OUTPUT_PATH

Exit codes:
    0 — 파일 작성됨
    2 — 잘못된 인자
    3 — 저장소 툴 호출 실패 (web-only degraded run으로 진행해야 함)
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

OHLCV_WINDOW_DAYS = 45  # get_stock_data에 넘길 조회 시작일 오프셋 (약 30 거래일)
STALE_CALENDAR_DAYS = 5


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: repo_market_data.py TICKER YYYY-MM-DD OUTPUT_PATH", file=sys.stderr)
        return 2

    ticker, date_str, out_path = sys.argv[1].upper(), sys.argv[2], Path(sys.argv[3])
    try:
        requested = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        print(f"invalid date (want YYYY-MM-DD): {date_str}", file=sys.stderr)
        return 2

    try:
        from tradingagents.agents.utils.agent_utils import (
            get_indicators,
            get_stock_data,
            get_verified_market_snapshot,
        )
        from tradingagents.dataflows.market_data_validator import (
            DEFAULT_SNAPSHOT_INDICATORS,
        )
    except Exception as exc:  # noqa: BLE001 — import 실패 = 검증된 수치 없음
        print(f"REPO TOOLS UNAVAILABLE: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3

    sections: list[str] = []

    # 1) 검증 스냅샷 — 제품이 "source of truth"로 지정한 툴.
    try:
        snapshot = get_verified_market_snapshot.invoke(
            {"symbol": ticker, "curr_date": date_str, "look_back_days": 30}
        )
    except Exception as exc:  # noqa: BLE001
        print(f"get_verified_market_snapshot FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3
    sections.append("## Tool: `get_verified_market_snapshot`\n\n" + snapshot)

    # 2) OHLCV — 설정된 core_stock_apis 벤더를 통해.
    start = (requested - timedelta(days=OHLCV_WINDOW_DAYS)).strftime("%Y-%m-%d")
    try:
        ohlcv = get_stock_data.invoke(
            {"symbol": ticker, "start_date": start, "end_date": date_str}
        )
    except Exception as exc:  # noqa: BLE001 — 부분 실패는 기록하고 계속
        ohlcv = f"not available ({type(exc).__name__}: {exc})"
    sections.append(
        f"## Tool: `get_stock_data` ({start} → {date_str})\n\n```csv\n{ohlcv}\n```"
    )

    # 3) 지표 — 저장소 상수 목록 그대로, 툴이 요구하는 대로 지표당 한 번씩.
    indicator_blocks: list[str] = []
    for name in DEFAULT_SNAPSHOT_INDICATORS:
        try:
            indicator_blocks.append(
                get_indicators.invoke(
                    {
                        "symbol": ticker,
                        "indicator": name,
                        "curr_date": date_str,
                        "look_back_days": 30,
                    }
                )
            )
        except Exception as exc:  # noqa: BLE001 — 지표 하나가 전체를 막지 않는다
            indicator_blocks.append(f"## {name}: not available ({type(exc).__name__}: {exc})")
    sections.append(
        "## Tool: `get_indicators` (repo DEFAULT_SNAPSHOT_INDICATORS, 30-day history)\n\n"
        + "\n\n".join(indicator_blocks)
    )

    # 가격 기준일 / stale guard — 툴이 스스로 찍은 줄을 읽을 뿐, 다시 계산하지 않는다.
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
        "> 저장소의 `@tool` 3개(`get_verified_market_snapshot`, `get_stock_data`,",
        "> `get_indicators`)를 그대로 호출한 출력이다. 제품의 market_analyst가 쓰는",
        "> 바로 그 툴이며, 벤더 라우팅·지표 계산·look-ahead 필터가 저장소 설정을",
        "> 따른다. 이 파일의 어떤 수치에도 LLM이 관여하지 않았고, 러너가 가공한",
        "> 값도 없다.",
        ">",
        "> **이 런에서 정확한 OHLCV·이동평균·RSI·MACD·Bollinger·ATR 수치의 source of",
        "> truth는 이 파일이다.** 웹 출처가 다른 값을 주면 채택하거나 평균 내지 말고",
        '> "web source mismatch"로만 기록한다.',
        "",
        *stale,
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(header) + "\n" + "\n\n---\n\n".join(sections) + "\n",
                        encoding="utf-8")

    print(f"written: {out_path}")
    if match:
        print(f"latest verified row: {match.group(1)}")
    close = re.search(r"\| Close \| ([\d.]+) \|", snapshot)
    if close:
        print(f"verified close: {close.group(1)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
