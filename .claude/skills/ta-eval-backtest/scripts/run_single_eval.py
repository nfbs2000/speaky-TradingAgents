#!/usr/bin/env python3
"""Run a single TradingAgents evaluation for a given ticker and date.

Usage:
    python3 run_single_eval.py AAPL 2026-01-15
    python3 run_single_eval.py MSFT 2026-02-01 --debug
    python3 run_single_eval.py GOOGL 2026-03-15 --analysts market,fundamentals
    python3 run_single_eval.py BTC-USD 2026-01-15 --asset-type crypto
    python3 run_single_eval.py AAPL 2026-01-15 --save-reports ./out --json

Requires the package installed (``pip install -e .``) and an API key for the
configured provider.
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Run a TradingAgents evaluation")
    parser.add_argument("ticker", help="Ticker symbol (e.g. AAPL, BTC-USD)")
    parser.add_argument("date", help="Trade date (YYYY-MM-DD)")
    parser.add_argument("--debug", action="store_true",
                        help="Stream the graph and pretty-print each message")
    parser.add_argument("--analysts", default="market,social,news,fundamentals",
                        help="Comma-separated analyst keys: market,social,news,fundamentals")
    parser.add_argument("--asset-type", default="stock", choices=("stock", "crypto"),
                        help="Pipeline variant (default: stock)")
    parser.add_argument("--provider", default=None, help="Override llm_provider")
    parser.add_argument("--deep-model", default=None, help="Override deep_think_llm")
    parser.add_argument("--quick-model", default=None, help="Override quick_think_llm")
    parser.add_argument("--debate-rounds", type=int, default=None,
                        help="Override max_debate_rounds")
    parser.add_argument("--risk-rounds", type=int, default=None,
                        help="Override max_risk_discuss_rounds")
    parser.add_argument("--memory-log", default=None,
                        help="Override memory_log_path (use to isolate an A/B arm)")
    parser.add_argument("--checkpoint", action="store_true",
                        help="Enable checkpoint/resume for this run")
    parser.add_argument("--save-reports", default=None, metavar="DIR",
                        help="Also write the markdown report tree to DIR")
    parser.add_argument("--json", action="store_true",
                        help="Print a machine-readable summary to stdout")

    args = parser.parse_args()

    # Import after parsing so bad args fail fast, before the heavy SDK imports.
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    config = dict(DEFAULT_CONFIG)
    if args.provider:
        config["llm_provider"] = args.provider
    if args.deep_model:
        config["deep_think_llm"] = args.deep_model
    if args.quick_model:
        config["quick_think_llm"] = args.quick_model
    if args.debate_rounds is not None:
        config["max_debate_rounds"] = args.debate_rounds
    if args.risk_rounds is not None:
        config["max_risk_discuss_rounds"] = args.risk_rounds
    if args.memory_log:
        config["memory_log_path"] = args.memory_log
    if args.checkpoint:
        config["checkpoint_enabled"] = True

    selected_analysts = tuple(a.strip() for a in args.analysts.split(",") if a.strip())

    if not args.json:
        print(f"Running: {args.ticker} on {args.date} ({args.asset_type})")
        print(f"Analysts: {', '.join(selected_analysts)}")
        print(f"Provider: {config['llm_provider']} | "
              f"deep={config['deep_think_llm']} quick={config['quick_think_llm']}")
        print(f"Rounds:   debate={config['max_debate_rounds']} "
              f"risk={config['max_risk_discuss_rounds']}")
        print("-" * 60)

    graph = TradingAgentsGraph(
        selected_analysts=selected_analysts,
        debug=args.debug,
        config=config,
    )

    final_state, signal = graph.propagate(
        args.ticker, args.date, asset_type=args.asset_type
    )

    report_path = None
    if args.save_reports:
        report_path = str(graph.save_reports(final_state, args.ticker,
                                            save_path=args.save_reports))

    log_dir = (f"{config['results_dir']}/{args.ticker}/TradingAgentsStrategy_logs")

    if args.json:
        json.dump({
            "ticker": args.ticker,
            "date": args.date,
            "asset_type": args.asset_type,
            "signal": signal,
            "provider": config["llm_provider"],
            "deep_think_llm": config["deep_think_llm"],
            "quick_think_llm": config["quick_think_llm"],
            "analysts": list(selected_analysts),
            "final_trade_decision": final_state["final_trade_decision"],
            "state_log_dir": log_dir,
            "report_path": report_path,
        }, sys.stdout, indent=2, ensure_ascii=False)
        print()
        return

    print("=" * 60)
    # 5-tier: Buy / Overweight / Hold / Underweight / Sell
    print(f"SIGNAL: {signal}")
    print("=" * 60)
    print(f"\nFinal Decision:\n{final_state['final_trade_decision'][:800]}")
    print(f"\nState log:  {log_dir}/full_states_log_{args.date}.json")
    if report_path:
        print(f"Reports:    {report_path}")
    print(f"Memory log: {config['memory_log_path']}")
    print("\nNote: this run's decision is logged as `pending`. Its reflection is")
    print("generated automatically at the start of the next run for this ticker.")


if __name__ == "__main__":
    main()
