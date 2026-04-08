"""Analysis functions for NICs exemption for disabled/inactive employees.

Computes breakdowns of employer NICs liability for employees who were
recently economically inactive or disabled, for use in the dashboard.
Uses microdf MicroSeries/MicroDataFrame for all weighted calculations.
"""

from __future__ import annotations

import numpy as np
from microdf import MicroDataFrame, MicroSeries


# ── Baseline summary ────────────────────────────────────────────────────


def build_baseline_summary(df: MicroDataFrame) -> dict:
    """Aggregate baseline employer NICs and labour market stats.

    Expected columns: ni_employer, age, is_disabled, employment_income.
    """
    w = df.weights

    working_age = ((df.age.values >= 16) & (df.age.values <= 64)).astype(float)
    employed = (df.employment_income.values > 0).astype(float)

    total_nics = df.ni_employer.sum() / 1e9
    n_working_age = MicroSeries(working_age, weights=w).sum()
    n_employed = MicroSeries(employed, weights=w).sum()
    n_disabled = MicroSeries(
        df.is_disabled.values.astype(float), weights=w
    ).sum()
    n_disabled_employed = MicroSeries(
        (df.is_disabled.values & (df.employment_income.values > 0)).astype(
            float
        ),
        weights=w,
    ).sum()

    return {
        "total_employer_nics_bn": round(float(total_nics), 1),
        "n_working_age": round(float(n_working_age)),
        "n_employed": round(float(n_employed)),
        "n_disabled": round(float(n_disabled)),
        "n_disabled_employed": round(float(n_disabled_employed)),
        "avg_employer_nics": round(
            float(
                MicroSeries(
                    df.ni_employer.values, weights=w * employed
                ).mean()
            )
        ),
    }


# ── By age group ────────────────────────────────────────────────────────


def build_nics_by_age(df: MicroDataFrame) -> list[dict]:
    """Employer NICs breakdown by age group.

    Expected columns: ni_employer, age, joined_labour_force_recently.
    """
    w = df.weights
    age_bins = [
        (16, 24, "16-24"),
        (25, 34, "25-34"),
        (35, 49, "35-49"),
        (50, 64, "50-64"),
        (65, 100, "65+"),
    ]
    has_recently = "joined_labour_force_recently" in df.columns
    rows = []
    for lo, hi, label in age_bins:
        mask = (df.age.values >= lo) & (df.age.values <= hi)
        if has_recently:
            recently_active = mask * np.clip(
                df.joined_labour_force_recently.values, 0, 1
            )
        else:
            recently_active = np.zeros_like(mask, dtype=float)

        n_total = MicroSeries(mask.astype(float), weights=w).sum()
        n_recently_active = MicroSeries(
            recently_active, weights=w
        ).sum()
        nics_total = (
            MicroSeries(df.ni_employer.values * mask, weights=w).sum() / 1e9
        )
        nics_recently_active = (
            MicroSeries(
                df.ni_employer.values * recently_active, weights=w
            ).sum()
            / 1e9
        )

        rows.append({
            "age_group": label,
            "n_total": round(float(n_total)),
            "n_recently_active": round(float(n_recently_active)),
            "pct_recently_active": round(
                float(n_recently_active / n_total * 100), 1
            ),
            "total_nics_bn": round(float(nics_total), 2),
            "nics_exemption_cost_bn": round(float(nics_recently_active), 2),
        })
    return rows


# ── By income decile ────────────────────────────────────────────────────


def build_nics_by_income_decile(df: MicroDataFrame) -> list[dict]:
    """Employer NICs breakdown by employment income decile.

    Expected columns: ni_employer, employment_income,
    joined_labour_force_recently.
    """
    w = df.weights
    employed = df.employment_income.values > 0
    income_decile = MicroSeries(
        df.employment_income.values, weights=w * employed
    ).decile_rank().values

    has_recently = "joined_labour_force_recently" in df.columns

    rows = []
    for d in range(1, 11):
        d_mask = (income_decile == d) & employed
        if has_recently:
            d_recently = d_mask * np.clip(
                df.joined_labour_force_recently.values, 0, 1
            )
        else:
            d_recently = np.zeros_like(d_mask, dtype=float)

        n_in_decile = MicroSeries(d_mask.astype(float), weights=w).sum()
        n_recently_active = MicroSeries(
            d_recently, weights=w
        ).sum()
        nics_total = (
            MicroSeries(df.ni_employer.values * d_mask, weights=w).sum() / 1e9
        )
        nics_exempt = (
            MicroSeries(df.ni_employer.values * d_recently, weights=w).sum()
            / 1e9
        )
        avg_income = (
            MicroSeries(
                df.employment_income.values, weights=w * d_mask
            ).mean()
            if float(n_in_decile) > 0
            else 0
        )

        rows.append({
            "decile": d,
            "n_employed": round(float(n_in_decile)),
            "n_recently_active": round(float(n_recently_active)),
            "total_nics_bn": round(float(nics_total), 2),
            "nics_exemption_cost_bn": round(float(nics_exempt), 2),
            "avg_employment_income": round(float(avg_income)),
        })
    return rows


# ── By disability status ────────────────────────────────────────────────


def build_nics_by_disability(df: MicroDataFrame) -> dict:
    """Employer NICs split by disability status.

    Expected columns: ni_employer, is_disabled, employment_income.
    """
    w = df.weights
    employed = df.employment_income.values > 0
    disabled = df.is_disabled.values.astype(bool)

    disabled_employed = disabled & employed
    nondisabled_employed = (~disabled) & employed

    n_disabled_employed = MicroSeries(
        disabled_employed.astype(float), weights=w
    ).sum()
    n_nondisabled_employed = MicroSeries(
        nondisabled_employed.astype(float), weights=w
    ).sum()

    nics_disabled = (
        MicroSeries(
            df.ni_employer.values * disabled_employed, weights=w
        ).sum()
        / 1e9
    )
    nics_nondisabled = (
        MicroSeries(
            df.ni_employer.values * nondisabled_employed, weights=w
        ).sum()
        / 1e9
    )

    avg_nics_disabled = (
        MicroSeries(
            df.ni_employer.values, weights=w * disabled_employed
        ).mean()
        if float(n_disabled_employed) > 0
        else 0
    )
    avg_nics_nondisabled = (
        MicroSeries(
            df.ni_employer.values, weights=w * nondisabled_employed
        ).mean()
        if float(n_nondisabled_employed) > 0
        else 0
    )

    return {
        "disabled": {
            "n_employed": round(float(n_disabled_employed)),
            "total_nics_bn": round(float(nics_disabled), 2),
            "avg_nics": round(float(avg_nics_disabled)),
        },
        "not_disabled": {
            "n_employed": round(float(n_nondisabled_employed)),
            "total_nics_bn": round(float(nics_nondisabled), 2),
            "avg_nics": round(float(avg_nics_nondisabled)),
        },
    }


# ── Cost-effectiveness ──────────────────────────────────────────────────


def compute_cost_effectiveness(
    exemption_cost_bn: float,
    n_target_employees: int,
) -> dict:
    """Compute cost-effectiveness metrics for the NICs exemption.

    Parameters
    ----------
    exemption_cost_bn : float
        Total employer NICs foregone under exemption, in billions.
    n_target_employees : int
        Number of employees qualifying for the exemption.
    """
    if n_target_employees <= 0:
        raise ValueError("n_target_employees must be positive.")
    cost_per_employee = exemption_cost_bn * 1e9 / n_target_employees
    return {
        "total_cost_bn": round(exemption_cost_bn, 2),
        "n_target_employees": n_target_employees,
        "cost_per_employee": round(cost_per_employee),
    }


# ── Employment entry estimates ──────────────────────────────────────────


def estimate_employment_entry_effect(
    exemption_cost_bn: float,
    elasticity: float,
    n_inactive: int,
    employer_nics_rate: float,
) -> dict:
    """Estimate additional employment entries from the NICs exemption.

    Uses a simple reduced-form elasticity: the percentage reduction in
    hiring cost translates to a proportional increase in hiring from the
    inactive pool.

    Parameters
    ----------
    exemption_cost_bn : float
        Total employer NICs foregone, in billions.
    elasticity : float
        Responsiveness of hiring to cost reduction (default 0.2).
    n_inactive : int
        Size of the economically inactive population of working age.
    employer_nics_rate : float
        Employer NICs rate from PolicyEngine parameters.
    """
    if n_inactive <= 0:
        raise ValueError("n_inactive must be positive.")
    if employer_nics_rate <= 0:
        raise ValueError("employer_nics_rate must be positive.")
    hiring_increase_pct = elasticity * employer_nics_rate
    additional_entries = round(n_inactive * hiring_increase_pct)
    if additional_entries <= 0:
        raise ValueError("additional_entries must be positive.")

    return {
        "elasticity": elasticity,
        "hiring_increase_pct": round(hiring_increase_pct * 100, 2),
        "additional_entries": additional_entries,
        "cost_per_additional_entry": round(
            exemption_cost_bn * 1e9 / additional_entries
        ),
    }


# ── Full analysis builder ──────────────────────────────────────────────


def build_full_analysis(df: MicroDataFrame) -> dict:
    """Build the complete analysis dictionary from an enriched MicroDataFrame.

    Expected columns: ni_employer, age, is_disabled, employment_income,
    and optionally joined_labour_force_recently.
    """
    summary = build_baseline_summary(df)
    by_age = build_nics_by_age(df)
    by_decile = build_nics_by_income_decile(df)
    by_disability = build_nics_by_disability(df)

    # Total exemption cost: NICs for recently-active employees
    has_recently = "joined_labour_force_recently" in df.columns
    if has_recently:
        recently_active = np.clip(df.joined_labour_force_recently.values, 0, 1)
        exemption_cost_bn = float(
            MicroSeries(
                df.ni_employer.values * recently_active, weights=df.weights
            ).sum()
            / 1e9
        )
        n_target = round(
            float(
                MicroSeries(
                    recently_active, weights=df.weights
                ).sum()
            )
        )
    else:
        exemption_cost_bn = 0.0
        n_target = 0

    cost_eff = compute_cost_effectiveness(exemption_cost_bn, n_target)

    return {
        "summary": summary,
        "by_age": by_age,
        "by_income_decile": by_decile,
        "by_disability": by_disability,
        "cost_effectiveness": cost_eff,
    }
