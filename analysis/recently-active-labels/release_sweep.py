"""Record what the published imputation call returns under one microimpute release.

The published results record no microimpute version, and ``pyproject.toml``
at 71add6e asked only for ``microimpute>=0.1.0``. The study began on
2026-04-01, when 1.15.1 was the newest release, and the June results came from
a run on 2026-06-12, when 3.1.1 was. This script runs the published call
(``synthetic_demo.published_imputation``) on the synthetic donors and
receivers under whichever release comes first on ``PYTHONPATH``, and adds that
release's distinct outputs to ``release_sweep_output.json``:

    uv pip install -e ".[imputation]" "microimpute==3.1.1"
    for v in 1.15.1 2.0.2 2.0.3 2.0.4 2.1.0 2.1.1 3.0.0 3.1.0 3.1.1; do
      uv pip install --target /tmp/mi-$v --no-deps "microimpute==$v"
      PYTHONPATH=/tmp/mi-$v python analysis/recently-active-labels/release_sweep.py
    done

``--no-deps`` keeps every release on the same scikit-learn and quantile-forest.
"""

from __future__ import annotations

import json
import sys
from importlib.metadata import version
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import synthetic_demo as demo  # noqa: E402


def main() -> None:
    rng = np.random.default_rng(demo.SEED)
    donors = demo.synthetic_donors(rng)
    receivers = demo.synthetic_receivers(rng)
    train_df = donors[donors["employment_income"].notna()]
    labels = demo.published_imputation(train_df, receivers)
    weights = receivers["person_weight"].to_numpy()
    adults = receivers["age"].to_numpy() >= 16

    output = HERE / "release_sweep_output.json"
    report = json.loads(output.read_text()) if output.exists() else {}
    report[version("microimpute")] = {
        "scikit_learn": version("scikit-learn"),
        "distinct_values": sorted({float(v) for v in labels}),
        "weighted_share_of_receivers_16_and_over_at_1": round(
            float(np.average(labels[adults] == 1, weights=weights[adults])), 6
        ),
    }
    ordered = dict(sorted(report.items(), key=lambda item: [int(p) for p in item[0].split(".")]))
    output.write_text(json.dumps(ordered, indent=2) + "\n")
    print(json.dumps({version("microimpute"): ordered[version("microimpute")]}, indent=2))


if __name__ == "__main__":
    main()
