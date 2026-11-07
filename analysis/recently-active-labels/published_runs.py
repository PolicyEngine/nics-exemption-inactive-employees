"""How the labelled shares moved across the published runs on one LFS panel.

Reads every committed version of ``data/nics_exemption_results.json`` from git
history and keeps the runs whose ``pct_active_by_age_lfs`` matches the current
file exactly, so all of them read the same LFS panel. For each run it prints
the labelled share and count by working-age band, the working-age count, the
pension-age count and the static cost.

Each run also changed code or data (the June 2026 run, for instance, stopped
coding missing LFS pay as £0), so the moves below do not isolate the labels'
effect. They show how far the labelled figures travelled while the measured
LFS shares stayed fixed.

    python analysis/recently-active-labels/published_runs.py
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = "data/nics_exemption_results.json"
OUTPUT = Path(__file__).with_name("published_runs_output.json")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def runs() -> list[dict]:
    current = json.loads((ROOT / PATH).read_text())
    commits = git("log", "--format=%H %ad", "--date=short", "--", PATH).split("\n")
    seen, out = set(), []
    for line in filter(None, commits):
        sha, date = line.split()
        results = json.loads(git("show", f"{sha}:{PATH}"))
        if results.get("pct_active_by_age_lfs") != current["pct_active_by_age_lfs"]:
            continue
        bands = results["baseline"]["by_age"]
        key = json.dumps(bands, sort_keys=True)
        if key in seen:  # a commit that left the results unchanged
            continue
        seen.add(key)
        working = [b for b in bands if not b["age_group"].endswith("+")]
        pension = [b for b in bands if b["age_group"].endswith("+")]
        out.append(
            {
                "commit": sha[:7],
                "date": date,
                "static_cost_bn": results["nics_exemption"]["nics_recently_active_bn"],
                "working_age_count": sum(b["n_recently_active"] for b in working),
                "pension_age": {b["age_group"]: b["n_recently_active"] for b in pension},
                "labelled_share_by_band": {
                    b["age_group"]: round(b["n_recently_active"] / b["n_total"], 4) for b in working
                },
                "count_by_band": {b["age_group"]: b["n_recently_active"] for b in working},
            }
        )
    return out


def main() -> None:
    text = json.dumps(runs(), indent=2)
    OUTPUT.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
