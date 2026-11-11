"""Record what the published imputation call returns under one microimpute release.

The published results record no microimpute version. This script runs the
published call (``synthetic_demo.published_imputation``) on the synthetic
donors and receivers under whichever release comes first on ``PYTHONPATH``,
and adds what that release returns to ``release_sweep_output.json``. A release
whose call fails gets its error instead. To cover every release PyPI lists up
to 3.1.1, the newest on the day of the June run:

    uv pip install -e ".[imputation]" "microimpute==3.1.1"
    for v in $(python analysis/recently-active-labels/release_sweep.py --list); do
      uv pip install --target "/tmp/mi-${v}" --no-deps "microimpute==${v}"
      PYTHONPATH="/tmp/mi-${v}" python analysis/recently-active-labels/release_sweep.py
    done

The first line brings in microimpute's dependencies, and ``--no-deps`` keeps
every release on those same scikit-learn, quantile-forest and pandas versions.
``--list`` prints the releases, oldest first, from PyPI's JSON API.
"""

from __future__ import annotations

import json
import sys
from importlib.metadata import version
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "release_sweep_output.json"
LAST_RELEASE = "3.1.1"


def version_key(text: str) -> list[int]:
    return [int(part) for part in text.split(".")]


def releases_up_to(last: str = LAST_RELEASE) -> list[str]:
    """Every microimpute release on PyPI up to ``last`` with a file not yanked, oldest first."""
    from urllib.request import urlopen

    with urlopen("https://pypi.org/pypi/microimpute/json", timeout=30) as response:
        listing = json.load(response)["releases"]
    kept = [
        name for name, files in listing.items() if files and not all(f.get("yanked") for f in files)
    ]
    return [
        name for name in sorted(kept, key=version_key) if version_key(name) <= version_key(last)
    ]


def summarise(labels: np.ndarray, adults: np.ndarray, weights: np.ndarray) -> dict:
    values = np.unique(labels)
    record = {
        "n_distinct_values": int(values.size),
        "min": float(values.min()),
        "max": float(values.max()),
        "weighted_share_of_receivers_16_and_over_at_1": round(
            float(np.average(labels[adults] == 1, weights=weights[adults])), 6
        ),
    }
    if values.size <= 10:
        record["distinct_values"] = [float(v) for v in values]
    return record


def main() -> None:
    sys.path.insert(0, str(HERE))
    import synthetic_demo as demo

    rng = np.random.default_rng(demo.SEED)
    donors = demo.synthetic_donors(rng)
    receivers = demo.synthetic_receivers(rng)
    train_df = donors[donors["employment_income"].notna()]
    weights = receivers["person_weight"].to_numpy()
    adults = receivers["age"].to_numpy() >= 16

    release = version("microimpute")
    entry: dict = {"scikit_learn": version("scikit-learn")}
    try:
        labels = demo.published_imputation(train_df, receivers)
    except Exception as error:  # an old release can lack the call's API
        entry["error"] = f"{type(error).__name__}: {error}"[:300]
    else:
        entry.update(summarise(np.asarray(labels, dtype=float), adults, weights))

    report = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    report[release] = entry
    ordered = dict(sorted(report.items(), key=lambda item: version_key(item[0])))
    OUTPUT.write_text(json.dumps(ordered, indent=2) + "\n")
    print(json.dumps({release: entry}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--list"]:
        print(" ".join(releases_up_to()))
    else:
        main()
