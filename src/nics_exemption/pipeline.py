"""Pipeline for NICs exemption for disabled/inactive employees.

Generates nics_exemption_results.json consumed by the dashboard.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
from microdf import MicroDataFrame, MicroSeries

from .lfs import (
    LFS_INACTIVITY_COLS,
    build_lfs_transition_targets,
)

DEFAULT_YEAR = 2025
DEFAULT_OUTPUT_PATH = Path("data/nics_exemption_results.json")
DEFAULT_DASHBOARD_OUTPUT_PATH = Path("dashboard/public/data/nics_exemption_results.json")

# LFS predictor variable mapping
PREDICTOR_MAPPING = {
    'AGE5': 'age',
    'SEX': 'sex',
    'MARSTA5': 'marital_status',
    'ETUKEUL5': 'ethnicity',
    'HIQUAL155': 'highest_qualification',
    'GOVTOR5': 'region',
    'FTPTWK5': 'full_or_part_time',
    'SOC20M5': 'occupation_code',
    'Inds07m5': 'industry_code',
    'PUBLICR5': 'public_or_private_sector',
    'GRSSWK5': 'gross_weekly_pay',
    'HRRATE5': 'hourly_pay_rate',
    'TEN15': 'housing_tenure',
    'HDPCH195': 'num_dependent_children',
    'QULNOW5': 'current_qualification_studying',
    'ENROLL5': 'enrolled_in_education',
    'LNGLST5': 'has_longstanding_illness',
    'LIMACT5': 'illness_limits_activities',
    'DISEA5': 'disability_equality_act',
    'LNGLST1': 'had_longstanding_illness_q1',
    'LIMACT1': 'illness_limited_activities_q1',
    'DISEA1': 'disability_equality_act_q1',
}

CATEGORICAL_VARS = [
    'sex', 'marital_status', 'ethnicity', 'highest_qualification', 'region',
    'full_or_part_time', 'public_or_private_sector', 'housing_tenure',
    'enrolled_in_education', 'current_qualification_studying',
    'has_longstanding_illness', 'illness_limits_activities', 'disability_equality_act',
    'had_longstanding_illness_q1', 'illness_limited_activities_q1', 'disability_equality_act_q1',
    'occupation_code', 'industry_code',
]

def _policyengine_classes():
    from policyengine_uk import Microsimulation
    return Microsimulation


def prepare_lfs_data(lfs_path: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    """Load and prepare LFS data for imputation.

    Returns (X_train, y_train, weights).
    """
    lfs = pd.read_csv(lfs_path, sep="\t")

    y_train = build_lfs_transition_targets(lfs, LFS_INACTIVITY_COLS)

    # Predictors
    X_train = lfs[list(PREDICTOR_MAPPING.keys())].rename(columns=PREDICTOR_MAPPING)
    weights = lfs['LGWT22'].copy()

    # Convert categoricals
    for col in CATEGORICAL_VARS:
        if col in X_train.columns:
            X_train[col] = (
                X_train[col].astype('Int64').astype(str).replace('<NA>', 'missing')
            )

    # Remove rows with missing weights/target
    mask = weights.notna() & y_train['activity_length_after_inactivity'].notna()
    return X_train[mask], y_train[mask], weights[mask]


def impute_inactivity_onto_frs(
    baseline, year: int, lfs_path: str
) -> pd.DataFrame:
    """Impute LFS inactivity variables onto Enhanced FRS using microimpute."""
    from microimpute.comparisons import autoimpute
    from microimpute import QRF

    # Get FRS data
    efrs = baseline.calculate_dataframe(
        ["age", "gender", "employment_income"], year
    )

    # Prepare LFS
    X_train, y_train, weights = prepare_lfs_data(lfs_path)

    # Combine for autoimpute
    lfs_df = pd.concat([X_train, y_train], axis=1)
    lfs_df["employment_income"] = lfs_df.gross_weekly_pay.clip(lower=0) * 52
    lfs_df["gender"] = lfs_df.sex.astype(int).map({1: "MALE", 2: "FEMALE"})
    lfs_df["weight"] = weights

    # Impute
    imputed_vars = ["joined_labour_force_recently"]
    predictor_vars = ["age", "gender", "employment_income"]
    for col in imputed_vars:
        lfs_df[col] = lfs_df[col].astype(float)

    results = autoimpute(
        lfs_df,
        efrs,
        predictors=predictor_vars,
        imputed_variables=imputed_vars,
        weight_col="weight",
        models=[QRF],
    )

    efrs_result = results.receiver_data.copy()
    efrs_result["joined_labour_force_recently"] = efrs_result[
        "joined_labour_force_recently"
    ].clip(0, 1)
    # Children not in LFS
    efrs_result["joined_labour_force_recently"] = np.where(
        efrs_result.age < 16, 0, efrs_result["joined_labour_force_recently"]
    )
    for col in efrs_result.columns:
        if col != "gender":
            efrs_result[col] = efrs_result[col].astype(np.float32)

    return efrs_result


def build_results(year: int = DEFAULT_YEAR, lfs_path: str = None) -> dict:
    """Build the full results JSON."""
    Microsimulation = _policyengine_classes()

    print("Loading baseline simulation...")
    baseline = Microsimulation()

    # Get person-level weights
    person_weights = baseline.calculate("person_weight", year)

    # Get employer NICs
    ni_employer = baseline.calculate("ni_employer", year)

    # Get additional variables for analysis
    age = baseline.calculate("age", year).values
    is_disabled = baseline.calculate("is_disabled_for_benefits", year).values

    results = {"year": year}

    if lfs_path:
        print("Imputing inactivity data from LFS...")
        efrs = impute_inactivity_onto_frs(baseline, year, lfs_path)
        efrs["ni_employer"] = ni_employer.values
        efrs_mdf = MicroDataFrame(efrs, weights=person_weights)
        working_age = (efrs.age.values >= 16) & (efrs.age.values <= 64)
        recent_prob = efrs.joined_labour_force_recently.values.astype(float)
        eligible_recent_prob = recent_prob * working_age

        nics_recently_active = (
            MicroSeries(efrs.ni_employer.values * eligible_recent_prob, weights=person_weights).sum()
            / 1e9
        )
        total_employer_nics = efrs_mdf.ni_employer.sum() / 1e9

        results["nics_exemption"] = {
            "total_employer_nics_bn": round(
                float(total_employer_nics), 1
            ),
            "nics_recently_active_bn": round(
                float(nics_recently_active), 1
            ),
            "nics_not_recently_active_bn": round(
                float(total_employer_nics - nics_recently_active), 1
            ),
        }

        # By age group
        age_groups = []
        age_bins = [
            (16, 24, "16-24"),
            (25, 34, "25-34"),
            (35, 49, "35-49"),
            (50, 64, "50-64"),
            (65, 100, "65+"),
        ]
        for lo, hi, label in age_bins:
            mask = (efrs.age >= lo) & (efrs.age <= hi)
            recently_active_prob = recent_prob * mask

            n_total = MicroSeries(
                mask.astype(float), weights=person_weights
            ).sum()
            n_recently_active = MicroSeries(
                recently_active_prob, weights=person_weights
            ).sum()
            nics_cost = MicroSeries(
                efrs.ni_employer.values * recently_active_prob,
                weights=person_weights,
            ).sum() / 1e9

            age_groups.append({
                "age_group": label,
                "n_total": round(float(n_total)),
                "n_recently_active": round(float(n_recently_active)),
                "pct_recently_active": round(
                    float(n_recently_active / n_total * 100), 1
                ),
                "nics_exemption_cost_bn": round(float(nics_cost), 2),
            })

        results["by_age"] = age_groups
        working_age_groups = [
            {
                "age_group": row["age_group"],
                "n_recently_active": row["n_recently_active"],
                "nics_exemption_cost_bn": row["nics_exemption_cost_bn"],
            }
            for row in age_groups
            if row["age_group"] != "65+"
        ]
        results["baseline"] = {
            "summary": {
                "total_employer_nics_bn": results["nics_exemption"]["total_employer_nics_bn"],
                "n_working_age": round(
                    float(MicroSeries(working_age.astype(float), weights=person_weights).sum())
                ),
                "n_disabled": round(
                    float(MicroSeries(is_disabled.astype(float), weights=person_weights).sum())
                ),
            },
            "by_age": age_groups,
        }
        results["reform"] = {
            "nics_exemption": {
                "static": {
                    "cost_bn": results["nics_exemption"]["nics_recently_active_bn"],
                },
                "by_age": working_age_groups,
            },
        }
    else:
        print("No LFS path provided, generating baseline-only results...")
        # Basic results without imputation
        results["baseline"] = {
            "summary": {
                "total_employer_nics_bn": round(
                    float(
                        MicroSeries(ni_employer, weights=person_weights).sum()
                        / 1e9
                    ),
                    1,
                ),
                "n_working_age": round(
                    float(
                        MicroSeries(
                            ((age >= 16) & (age <= 64)).astype(float),
                            weights=person_weights,
                        ).sum()
                    )
                ),
                "n_disabled": round(
                    float(
                        MicroSeries(
                            is_disabled.astype(float), weights=person_weights
                        ).sum()
                    )
                ),
            },
        }

    return results


def write_results(
    results: dict, output_path: Path = DEFAULT_OUTPUT_PATH
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(results, indent=2) + "\n")
    return output_path


def sync_dashboard_results(
    source_path: Path = DEFAULT_OUTPUT_PATH,
    dashboard_output_path: Path = DEFAULT_DASHBOARD_OUTPUT_PATH,
) -> Path:
    dashboard_output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, dashboard_output_path)
    return dashboard_output_path


def generate_results_file(
    year: int = DEFAULT_YEAR,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    sync_dashboard: bool = False,
    dashboard_output_path: Path = DEFAULT_DASHBOARD_OUTPUT_PATH,
    lfs_path: str = None,
) -> dict:
    results = build_results(year=year, lfs_path=lfs_path)
    written_output = write_results(results, output_path)
    if sync_dashboard:
        sync_dashboard_results(written_output, dashboard_output_path)
    return results
