"""Show, on synthetic data, what the published imputation call writes and what the fix does.

The published pipeline (commit 71add6e) imputes ``joined_labour_force_recently``
with microimpute's ``autoimpute(..., models=[QRF])`` and uses the result,
clipped to [0, 1], as each person's probability of having joined recently.
This script builds synthetic LFS-like donors and FRS-like receivers and runs:

A. The published call, on whichever microimpute the environment holds. The
   published results record no microimpute version; ``release_sweep.py`` runs
   this call under every release up to 3.1.1, the newest on the day of the
   June run.
B. The fix: microcosm-fit's CategoricalClassifier probabilities, scaled within
   each working-age band to the donors' weighted share.

For each age band it reports the weighted share among receivers next to the
true share (the synthetic probability the script draws the data from, averaged
over the band's receivers) and the share the donors show directly. Donors and
receivers draw pay from the same model at each age, so the direct share
estimates the true one. Donors stop at 70, as the LFS panel does; receivers
run to 80.

    python analysis/recently-active-labels/synthetic_demo.py
    PYTHONPATH=<dir holding microimpute 1.15.1> python analysis/recently-active-labels/synthetic_demo.py

Part A needs microimpute, part B the ``imputation`` extra. Each run writes
``synthetic_demo_output_microimpute_<version>.json``. The script draws all its
data from the synthetic model; no LFS or FRS record enters it.
"""

from __future__ import annotations

import json
import sys
from importlib.metadata import version
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from nics_exemption.imputation import (  # noqa: E402
    PREDICTORS,
    TARGET,
    AgeBand,
    impute_recently_active,
    weighted_mean,
    working_age_bands,
)

SEED = 20261107
STATE_PENSION_AGE = 66
OLDEST_DONOR = 70
OLDEST_RECEIVER = 80
MISSING_PAY_RATE = 0.15


def employment_and_pay(rng: np.random.Generator, age: np.ndarray) -> np.ndarray:
    """Annual pay, 0 for people not in work; one model for donors and receivers."""
    employed_rate = np.select(
        [age < 16, age < 25, age < 50, age < STATE_PENSION_AGE, age <= OLDEST_DONOR],
        [0.0, 0.55, 0.8, 0.65, 0.12],
        0.04,
    )
    employed = rng.random(len(age)) < employed_rate
    log_pay = 9.4 + 0.05 * np.clip(age - 16, 0, 20) + rng.normal(0, 0.7, len(age))
    return np.where(employed, np.exp(log_pay), 0.0)


def true_probability(age: np.ndarray, gender: np.ndarray, pay: np.ndarray) -> np.ndarray:
    """The synthetic P(joined recently | age, gender, pay): highest for young, low-paid workers."""
    base = np.select(
        [age < 25, age < 35, age < 50, age < STATE_PENSION_AGE], [-3.9, -4.9, -5.4, -5.6], -5.3
    )
    employed = pay > 0
    log_pay = np.log(np.where(employed, pay, 1.0))
    logit = base + employed * (2.0 - 0.6 * (log_pay - 10.0)) + 0.1 * (gender == "FEMALE")
    return 1 / (1 + np.exp(-logit))


def synthetic_people(rng: np.random.Generator, n: int, oldest: int, youngest: int) -> pd.DataFrame:
    age = rng.integers(youngest, oldest + 1, n).astype(float)
    gender = rng.choice(["MALE", "FEMALE"], n)
    pay = employment_and_pay(rng, age)
    return pd.DataFrame(
        {
            "age": age,
            "gender": gender,
            "employment_income": pay,
            "true_probability": true_probability(age, gender, pay),
        }
    )


def synthetic_donors(rng: np.random.Generator, n: int = 6000) -> pd.DataFrame:
    """LFS-like panel members aged 16-70; some employees' pay is missing, at random."""
    donors = synthetic_people(rng, n, OLDEST_DONOR, 16)
    donors[TARGET] = rng.random(n) < donors["true_probability"]
    missing = (donors["employment_income"] > 0) & (rng.random(n) < MISSING_PAY_RATE)
    donors.loc[missing, "employment_income"] = np.nan
    donors["weight"] = rng.lognormal(np.log(2500), 0.5, n)
    return donors


def synthetic_receivers(rng: np.random.Generator, n: int = 40_000) -> pd.DataFrame:
    receivers = synthetic_people(rng, n, OLDEST_RECEIVER, 0)
    receivers["person_weight"] = rng.lognormal(np.log(1700), 0.4, n)
    return receivers


def published_imputation(train_df: pd.DataFrame, receivers: pd.DataFrame) -> np.ndarray:
    """Steps 4-5 as published (commit 71add6e), apart from data loading."""
    from microimpute import QRF
    from microimpute.comparisons import autoimpute

    train_df = train_df.assign(**{TARGET: train_df[TARGET].astype(float)})
    results = autoimpute(
        train_df,
        receivers[PREDICTORS],
        predictors=PREDICTORS,
        imputed_variables=[TARGET],
        weight_col="weight",
        models=[QRF],
    )
    imputed = results.receiver_data[TARGET].clip(0, 1).to_numpy()
    return np.where(receivers["age"].to_numpy() < 16, 0, imputed)


def band_rows(bands, receivers, donors, columns):
    ages = receivers["age"].to_numpy()
    weights = receivers["person_weight"].to_numpy()
    rows = []
    for band in bands:
        in_band = band.contains(ages)
        in_donors = band.contains(donors["age"].to_numpy())
        row = {
            "age_group": band.label,
            "true_share": weighted_mean(
                receivers["true_probability"].to_numpy()[in_band], weights[in_band]
            ),
            "direct_share_in_donors": (
                weighted_mean(
                    donors[TARGET].to_numpy(dtype=float)[in_donors],
                    donors["weight"].to_numpy()[in_donors],
                )
                if in_donors.any()
                else None
            ),
        }
        for name, values in columns.items():
            row[name] = weighted_mean(values[in_band], weights[in_band])
        rows.append(row)
    return rows


def main() -> None:
    rng = np.random.default_rng(SEED)
    donors = synthetic_donors(rng)
    receivers = synthetic_receivers(rng)
    train_df = donors[donors["employment_income"].notna()]
    working_bands = working_age_bands(STATE_PENSION_AGE)
    report: dict = {
        "donors": len(donors),
        "donors_joined_recently": int(donors[TARGET].sum()),
        "donors_with_missing_pay_dropped_from_the_fit": int(len(donors) - len(train_df)),
        "receivers": len(receivers),
        "packages": {"scikit_learn": version("scikit-learn")},
    }

    columns = {}
    try:
        labels = published_imputation(train_df, receivers)
        report["packages"]["microimpute"] = version("microimpute")
        report["A_published"] = {"distinct_imputed_values": sorted({float(v) for v in labels})}
        columns["A_published_share"] = labels
    except ImportError:
        report["packages"]["microimpute"] = None
        report["A_published"] = "skipped: microimpute is not installed"

    eligible = ((receivers["age"] >= 16) & (receivers["age"] < STATE_PENSION_AGE)).to_numpy()
    fix = impute_recently_active(
        train_df[PREDICTORS + [TARGET, "weight"]],
        receivers[PREDICTORS],
        lfs_ages=donors["age"].to_numpy(),
        lfs_joined=donors[TARGET].to_numpy(),
        lfs_weights=donors["weight"].to_numpy(),
        eligible=eligible,
        person_weights=receivers["person_weight"].to_numpy(),
        bands=working_bands,
    )
    report["B_fix"] = {
        "distinct_values_among_working_age": int(len(np.unique(fix.probabilities[eligible]))),
        "nonzero_outside_working_age": int((fix.probabilities[~eligible] != 0).sum()),
        "people_at_probability_1": int((fix.probabilities >= 1).sum()),
    }
    columns["B_classifier_share_before_calibration"] = fix.classifier_probabilities
    columns["B_fix_share"] = fix.probabilities

    report_bands = [
        *working_bands,
        AgeBand(16, STATE_PENSION_AGE - 1),
        AgeBand(STATE_PENSION_AGE, OLDEST_DONOR),
        AgeBand(OLDEST_DONOR + 1, OLDEST_RECEIVER),
    ]
    report["by_age_band"] = band_rows(report_bands, receivers, donors, columns)

    microimpute_version = report["packages"]["microimpute"] or "none"
    output = Path(__file__).with_name(
        f"synthetic_demo_output_microimpute_{microimpute_version}.json"
    )
    text = json.dumps(report, indent=2)
    output.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
