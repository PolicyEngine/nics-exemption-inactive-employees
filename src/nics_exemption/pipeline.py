"""Main NICs exemption pipeline.

Builds the dashboard JSON from PolicyEngine UK + LFS longitudinal data.
Wrapped as :func:`run` so it can be invoked from the package CLI
(:mod:`nics_exemption.cli`) or imported directly.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from microdf import MicroDataFrame, MicroSeries

from .lfs import build_lfs_transition_targets

# Latest PolicyEngine UK enhanced-FRS microdata, hosted on Hugging Face.
# Requires `HUGGING_FACE_TOKEN` (with read access to the
# `policyengine/policyengine-uk-data-private` repo) to be set in the
# environment before the pipeline is invoked. We pass this URL explicitly to
# `Microsimulation(...)` so the dataset is fetched directly from HF — there is
# no local-file fallback. To pin a specific data release, append `@<version>`
# (e.g. `@1.40.3`); leaving it unpinned tracks whatever PolicyEngine publishes
# as the latest.
DATASET_URL = "hf://policyengine/policyengine-uk-data-private/enhanced_frs_2023_24.h5"


def run(args: argparse.Namespace) -> None:
    """Run the pipeline end-to-end and write the dashboard JSON."""
    # ── Step 1: Load PolicyEngine baseline ──────────────────────────────────

    print(f"Step 1: Loading PolicyEngine UK baseline from {DATASET_URL} ...")
    from policyengine_uk import Microsimulation

    baseline = Microsimulation(dataset=DATASET_URL)
    YEAR = args.year

    # ── Step 2: Load and prepare LFS data ──────────────────────────────────

    print("Step 2: Loading LFS data...")
    LFS_PATH = args.lfs_path
    lfs = pd.read_csv(LFS_PATH, sep="\t")

    inactivity_variables = [
        "INCAC051",
        "INCAC052",
        "INCAC053",
        "INCAC054",
        "INCAC055",
    ]

    y_train = build_lfs_transition_targets(lfs, inactivity_variables)

    predictor_mapping = {
        "AGE5": "age",
        "SEX": "sex",
        "MARSTA5": "marital_status",
        "ETUKEUL5": "ethnicity",
        "HIQUAL155": "highest_qualification",
        "GOVTOR5": "region",
        "FTPTWK5": "full_or_part_time",
        "SOC20M5": "occupation_code",
        "Inds07m5": "industry_code",
        "PUBLICR5": "public_or_private_sector",
        "GRSSWK5": "gross_weekly_pay",
        "HRRATE5": "hourly_pay_rate",
        "TEN15": "housing_tenure",
        "HDPCH195": "num_dependent_children",
        "QULNOW5": "current_qualification_studying",
        "ENROLL5": "enrolled_in_education",
        "LNGLST5": "has_longstanding_illness",
        "LIMACT5": "illness_limits_activities",
        "DISEA5": "disability_equality_act",
        "LNGLST1": "had_longstanding_illness_q1",
        "LIMACT1": "illness_limited_activities_q1",
        "DISEA1": "disability_equality_act_q1",
    }

    X_train = lfs[list(predictor_mapping.keys())].rename(columns=predictor_mapping)
    weights = lfs["LGWT22"].copy()

    categorical_vars = [
        "sex",
        "marital_status",
        "ethnicity",
        "highest_qualification",
        "region",
        "full_or_part_time",
        "public_or_private_sector",
        "housing_tenure",
        "enrolled_in_education",
        "current_qualification_studying",
        "has_longstanding_illness",
        "illness_limits_activities",
        "disability_equality_act",
        "had_longstanding_illness_q1",
        "illness_limited_activities_q1",
        "disability_equality_act_q1",
        "occupation_code",
        "industry_code",
    ]

    for col in categorical_vars:
        if col in X_train.columns:
            X_train[col] = X_train[col].astype("Int64").astype(str).replace("<NA>", "missing")

    mask = weights.notna() & y_train["activity_length_after_inactivity"].notna()
    X_train = X_train[mask]
    y_train = y_train[mask]
    weights = weights[mask]

    print(f"  LFS shapes - X: {X_train.shape}, y: {y_train.shape}")
    print(f"  Positive class rate: {y_train['joined_labour_force_recently'].mean():.3f}")
    lfs_transition_rate = MicroSeries(
        y_train.joined_labour_force_recently.astype(float).values,
        weights=weights.values,
    ).mean()
    print(f"  Weighted transition rate: {float(lfs_transition_rate):.3f}")

    # ── Step 2b: Compute baseline stats from PolicyEngine & LFS ─────────────

    print("Step 2b: Computing baseline statistics from PolicyEngine & LFS...")

    age = baseline.calculate("age", YEAR).values
    person_weights = baseline.calculate("person_weight", YEAR)
    employment_status = baseline.calculate("employment_status", YEAR).values
    is_disabled_benefits = baseline.calculate("is_disabled_for_benefits", YEAR).values
    gender_arr = baseline.calculate("gender", YEAR).values

    # Working age: 16 (legal minimum work age) up to (but not including) state
    # pension age. SPA is read from PolicyEngine UK's parameter database for
    # the modelled year — for 2026 this is 66 for both men and women.
    _params = baseline.tax_benefit_system.parameters(f"{YEAR}-01-01")
    SPA_MALE = int(_params.gov.dwp.state_pension.age.male)
    SPA_FEMALE = int(_params.gov.dwp.state_pension.age.female)
    spa_per_person = np.where(gender_arr == "MALE", SPA_MALE, SPA_FEMALE)
    working_age = (age >= 16) & (age < spa_per_person)
    SPA = max(SPA_MALE, SPA_FEMALE)  # used for dashboard age-bin labels

    # Economically inactive: working-age people in non-active employment statuses
    inactive_statuses = [
        "LONG_TERM_DISABLED",
        "SHORT_TERM_DISABLED",
        "CARER",
        "STUDENT",
        "RETIRED",
    ]
    is_inactive = np.isin(employment_status, inactive_statuses) & working_age

    # Broad disability definition: union of benefit receipt + disability-related
    # employment statuses + ESA receipt + attendance allowance receipt.
    # This is broader than is_disabled_for_benefits (DLA/PIP only) but still
    # narrower than the Equality Act self-reported definition (~10.4M).
    pip_vals = baseline.calculate("pip", YEAR).values.astype(float)
    dla_vals = baseline.calculate("dla", YEAR).values.astype(float)
    esa_contrib_vals = baseline.calculate("esa_contrib", YEAR).values.astype(float)
    aa_vals = baseline.calculate("attendance_allowance", YEAR).values.astype(float)

    is_disabled_broad = (
        is_disabled_benefits
        | (esa_contrib_vals > 0)
        | (aa_vals > 0)
        | np.isin(employment_status, ["LONG_TERM_DISABLED", "SHORT_TERM_DISABLED"])
    )

    n_economically_inactive = float(
        MicroSeries(is_inactive.astype(float), weights=person_weights).sum()
    )
    n_disabled = float(
        MicroSeries((is_disabled_broad & working_age).astype(float), weights=person_weights).sum()
    )
    n_inactive_disabled = float(
        MicroSeries((is_inactive & is_disabled_broad).astype(float), weights=person_weights).sum()
    )

    print("  Disability definition breakdown:")
    print(
        f"    DLA/PIP only: {float(MicroSeries((is_disabled_benefits & working_age).astype(float), weights=person_weights).sum()):,.0f}"
    )
    print(
        f"    + ESA contrib: {float(MicroSeries(((is_disabled_benefits | (esa_contrib_vals > 0)) & working_age).astype(float), weights=person_weights).sum()):,.0f}"
    )
    print(
        f"    + AA: {float(MicroSeries(((is_disabled_benefits | (esa_contrib_vals > 0) | (aa_vals > 0)) & working_age).astype(float), weights=person_weights).sum()):,.0f}"
    )
    print(
        f"    + Employment status disabled: {float(MicroSeries((is_disabled_broad & working_age).astype(float), weights=person_weights).sum()):,.0f}"
    )

    # Disability-related benefits: PIP + DLA + AA + ESA (income + contrib) + Carer's Allowance
    benunit_weights = baseline.calculate("benunit_weight", YEAR)

    pip_total = MicroSeries(pip_vals, weights=person_weights).sum()
    dla_total = MicroSeries(dla_vals, weights=person_weights).sum()
    aa_total = MicroSeries(aa_vals, weights=person_weights).sum()
    ca_total = MicroSeries(
        baseline.calculate("carers_allowance", YEAR).values.astype(float),
        weights=person_weights,
    ).sum()
    esa_contrib_total = MicroSeries(esa_contrib_vals, weights=person_weights).sum()
    esa_income_total = MicroSeries(
        baseline.calculate("esa_income", YEAR).values.astype(float),
        weights=benunit_weights,
    ).sum()

    total_disability_benefits_bn = (
        pip_total + dla_total + aa_total + ca_total + esa_contrib_total + esa_income_total
    ) / 1e9

    # Employment rates and disability employment gap
    employed_statuses = ["FT_EMPLOYED", "PT_EMPLOYED", "FT_SELF_EMPLOYED", "PT_SELF_EMPLOYED"]
    is_employed = np.isin(employment_status, employed_statuses) & working_age

    dis_employed = is_disabled_broad & is_employed
    n_dis_employed = float(MicroSeries(dis_employed.astype(float), weights=person_weights).sum())
    dis_emp_rate = round(n_dis_employed / n_disabled * 100, 1)

    non_dis = ~is_disabled_broad & working_age
    non_dis_employed = non_dis & is_employed
    n_non_dis = float(MicroSeries(non_dis.astype(float), weights=person_weights).sum())
    n_non_dis_employed = float(
        MicroSeries(non_dis_employed.astype(float), weights=person_weights).sum()
    )
    non_dis_emp_rate = round(n_non_dis_employed / n_non_dis * 100, 1)
    disability_emp_gap = round(non_dis_emp_rate - dis_emp_rate, 1)

    pct_inactive_disabled = round(n_inactive_disabled / n_economically_inactive * 100, 1)

    # Average employer NICs per employed worker
    ni_employer_vals = baseline.calculate("ni_employer", YEAR).values.astype(float)
    avg_nics_per_worker = round(
        float(MicroSeries(ni_employer_vals * is_employed, weights=person_weights).sum())
        / float(MicroSeries(is_employed.astype(float), weights=person_weights).sum())
    )

    print(f"  Economically inactive (working age): {n_economically_inactive:,.0f}")
    print(f"  Disabled (working age): {n_disabled:,.0f}")
    print(f"  Inactive & disabled: {n_inactive_disabled:,.0f}")
    print(f"  Total disability benefits: £{total_disability_benefits_bn:.1f}bn")
    print(f"  Disabled employment rate: {dis_emp_rate}%")
    print(f"  Non-disabled employment rate: {non_dis_emp_rate}%")
    print(f"  Disability employment gap: {disability_emp_gap}pp")
    print(f"  % of inactive who are disabled: {pct_inactive_disabled}%")
    print(f"  Avg employer NICs per worker: £{avg_nics_per_worker:,}")

    # Inactivity reasons from LFS (most recent quarter, working-age — same SPA cutoff)
    lfs_age = lfs["AGE5"]
    lfs_working_age = (lfs_age >= 16) & (lfs_age < SPA)
    lfs_inactive_col = "INCAC055"
    lfs_inactive_mask = (lfs[lfs_inactive_col] >= 6) & lfs_working_age

    _reason_map = {
        6: "Long-term sick or disabled",
        7: "Looking after family/home",
        10: "Other",
        13: "Student",
        14: "Looking after family/home",
        15: "Temporarily sick or disabled",
        16: "Long-term sick or disabled",
        17: "Other",
        18: "Retired early",
        19: "Other",
        20: "Retired early",
        21: "Other",
        24: "Student",
        25: "Looking after family/home",
        26: "Temporarily sick or disabled",
        27: "Long-term sick or disabled",
        28: "Other",
        29: "Other",
        30: "Retired early",
        31: "Other",
        32: "Other",
        33: "Other",
    }

    _inactive_lfs = lfs.loc[lfs_inactive_mask, [lfs_inactive_col, "LGWT22"]].copy()
    _inactive_lfs["reason"] = _inactive_lfs[lfs_inactive_col].map(_reason_map).fillna("Other")
    # Sum LGWT22 (the LFS person weight) per reason — the result equals
    # the weighted count of working-age inactive people in each reason category.
    inactivity_reasons_series = (
        _inactive_lfs.groupby("reason")["LGWT22"].sum().sort_values(ascending=False)
    )
    inactivity_reasons = [
        {"reason": reason, "count": round(float(count))}
        for reason, count in inactivity_reasons_series.items()
    ]

    for item in inactivity_reasons:
        print(f"  {item['reason']}: {item['count']:,}")

    # ── Step 3: Prepare donor data and run autoimpute ──────────────────────

    print("Step 3: Preparing imputation...")
    df = pd.concat([X_train, y_train], axis=1)
    df["employment_income"] = df.gross_weekly_pay.clip(lower=0) * 52
    df["gender"] = df.sex.astype(int).map({1: "MALE", 2: "FEMALE"})
    df["weight"] = weights

    efrs = baseline.calculate_dataframe(["age", "gender", "employment_income"], YEAR)

    imputed_vars = ["joined_labour_force_recently"]
    predictor_vars = ["age", "gender", "employment_income"]

    print("Step 4: Running imputation...")

    # Cast booleans to float to avoid numpy boolean subtract error in cross-validation
    for col in imputed_vars:
        df[col] = df[col].astype(float)

    from microimpute import QRF
    from microimpute.comparisons import autoimpute

    # Use QRF because it preserves heterogeneity for the rare transition target.
    print("  Running autoimpute with QRF...")
    results = autoimpute(
        df,
        efrs,
        predictors=predictor_vars,
        imputed_variables=imputed_vars,
        weight_col="weight",
        models=[QRF],
    )
    print(f"  CV results:\n{results.cv_results}")

    # ── Step 5: Process imputed results (exactly as notebook) ──────────────

    print("Step 5: Processing imputed results...")
    # autoimpute returns AutoImputeResult with .receiver_data containing imputations
    efrs_imp = results.receiver_data.copy()
    print(f"  Columns: {list(efrs_imp.columns)}")
    efrs_imp["joined_labour_force_recently"] = efrs_imp["joined_labour_force_recently"].clip(0, 1)
    print(
        f"  joined_labour_force_recently mean: {efrs_imp.joined_labour_force_recently.mean():.4f}"
    )
    efrs_imp["joined_labour_force_recently"] = np.where(
        efrs_imp.age < 16, 0, efrs_imp["joined_labour_force_recently"]
    )

    for col in efrs_imp.columns:
        if col != "gender":
            efrs_imp[col] = efrs_imp[col].astype(np.float32)

    # ── Step 6: Calculate employer NICs (the key result) ───────────────────

    print("Step 6: Computing employer NICs...")
    ni_employer = baseline.calculate("ni_employer", YEAR)

    efrs_imp["ni_employer"] = ni_employer.values

    # Map household/benunit variables to person level via entity projection
    _person_pop = baseline.populations["person"]
    efrs_imp["country"] = _person_pop.household("country", YEAR)
    efrs_imp["family_type"] = _person_pop.benunit("family_type", YEAR)

    efrs_mdf = MicroDataFrame(efrs_imp, weights=person_weights)
    recent_prob = efrs_imp.joined_labour_force_recently.values.astype(float)
    eligible_recent_prob = recent_prob * working_age

    nics_recently_active = float(
        MicroSeries(
            efrs_imp.ni_employer.values * eligible_recent_prob, weights=person_weights
        ).sum()
        / 1e9
    )
    total_nics = float(efrs_mdf.ni_employer.sum() / 1e9)
    nics_not_recently_active = total_nics - nics_recently_active

    print("\n" + "=" * 60)
    print("KEY RESULTS — Employer NICs by recently-active status:")
    print("=" * 60)
    print(f"\nTotal employer NICs: £{total_nics:.1f}bn")
    print(f"NICs on recently-active working-age employees: £{nics_recently_active:.2f}bn")
    print(f"NICs on other employees:                       £{nics_not_recently_active:.2f}bn")
    print(f"Cost of exemption (static):                    £{nics_recently_active:.2f}bn")

    # Average NICs per recently-active worker (working age only)
    _n_wa_recent = float(MicroSeries(eligible_recent_prob, weights=person_weights).sum())
    _nics_wa_recent = float(
        MicroSeries(
            efrs_imp.ni_employer.values * eligible_recent_prob, weights=person_weights
        ).sum()
    )
    if _n_wa_recent <= 0:
        raise ValueError("No recently active working-age employees found.")
    avg_nics_per_recent = round(_nics_wa_recent / _n_wa_recent)
    print(f"Avg employer NICs per recently-active worker: £{avg_nics_per_recent:,}")

    # ── Step 7: Build age-group breakdowns ─────────────────────────────────

    print("\nStep 7: Building age-group breakdowns...")
    # Age bins for the dashboard. The bottom of the post-SPA bin is read from
    # PolicyEngine so the "above-state-pension-age" group adjusts automatically
    # as SPA legislation changes.
    above_spa_label = f"{SPA}+"
    age_bins = [
        (16, 24, "16-24"),
        (25, 34, "25-34"),
        (35, 49, "35-49"),
        (50, SPA - 1, f"50-{SPA - 1}"),
        (SPA, 120, above_spa_label),
    ]

    age_data = []
    for lo, hi, label in age_bins:
        m = (efrs_imp.age >= lo) & (efrs_imp.age <= hi)
        m_recent_prob = recent_prob * m

        n_total = float(MicroSeries(m.astype(float), weights=person_weights).sum())
        n_recent = float(MicroSeries(m_recent_prob, weights=person_weights).sum())
        nics_recent = float(
            MicroSeries(efrs_imp.ni_employer.values * m_recent_prob, weights=person_weights).sum()
            / 1e9
        )
        nics_total = float(
            MicroSeries(efrs_imp.ni_employer.values * m, weights=person_weights).sum() / 1e9
        )

        pct_recent = round(n_recent / n_total * 100, 1)

        print(
            f"  {label}: {n_recent:,.0f} recently active, "
            f"£{nics_recent:.2f}bn NICs exemption cost, "
            f"{pct_recent}% rate"
        )

        age_data.append(
            {
                "age_group": label,
                "n_total": round(n_total),
                "n_recently_active": round(n_recent),
                "pct_recently_active": pct_recent,
                "nics_exemption_cost_bn": round(nics_recent, 2),
                "employer_nics_bn": round(nics_total, 1),
            }
        )

    # ── Step 7b: Build breakdowns by gender, country, family type ─────────

    print("\nStep 7b: Building breakdowns by gender, country, family type...")

    is_recent = recent_prob
    # Mirror the SPA-aware working-age definition used elsewhere; we already
    # have it as `working_age` (np.ndarray), reuse it directly.
    is_working_age = working_age

    def _build_breakdown(group_col, group_vals):
        rows = []
        for val in group_vals:
            m = (efrs_imp[group_col] == val) & is_working_age
            m_recent = is_recent * m
            n_recent = float(MicroSeries(m_recent, weights=person_weights).sum())
            nics_cost = float(
                MicroSeries(efrs_imp.ni_employer.values * m_recent, weights=person_weights).sum()
                / 1e9
            )
            rows.append(
                {
                    "group": str(val).replace("_", " ").title(),
                    "n_recently_active": round(n_recent),
                    "nics_exemption_cost_bn": round(nics_cost, 2),
                }
            )
        return rows

    by_gender = _build_breakdown("gender", ["MALE", "FEMALE"])
    by_country = _build_breakdown("country", ["ENGLAND", "SCOTLAND", "WALES", "NORTHERN_IRELAND"])
    by_family = _build_breakdown(
        "family_type",
        [
            "SINGLE",
            "COUPLE_NO_CHILDREN",
            "COUPLE_WITH_CHILDREN",
            "LONE_PARENT",
        ],
    )

    for label, data_list in [
        ("Gender", by_gender),
        ("Country", by_country),
        ("Family type", by_family),
    ]:
        print(f"  {label}:")
        for r in data_list:
            print(
                f"    {r['group']}: {r['n_recently_active']:,} active, £{r['nics_exemption_cost_bn']}bn"
            )

    # ── Step 8: Build by-age chart data (% becoming active, like notebook) ─

    print("\nStep 8: Building activity-by-age chart data...")

    # Chart 1 from notebook: LFS raw data — % becoming active by age
    lfs_df_chart = pd.DataFrame(
        {
            "age": X_train.age.astype(float),
            "became_active": y_train.joined_labour_force_recently.astype(float),
        }
    )
    lfs_df_chart["weight"] = weights.values
    lfs_mdf = MicroDataFrame(lfs_df_chart, weights=lfs_df_chart.weight)
    pct_active_by_age_lfs = lfs_mdf.became_active.groupby(lfs_mdf.age).mean()

    # Chart 2 from notebook: Imputed onto Enhanced FRS
    pct_active_by_age = efrs_mdf.joined_labour_force_recently.groupby(efrs_mdf.age).mean()

    # ── Step 9: Behavioural model — labour supply response ────────────────

    print("\nStep 9: Behavioural model — labour supply response...")

    # Full pass-through assumption: employer NICs saving is passed to the
    # worker as higher wages.  For each inactive person we:
    #   1. Impute a potential wage (median by age band × gender from employed pop)
    #   2. Calculate the employer NICs on that wage (= the saving under exemption)
    #   3. With full pass-through the worker's gross wage rises by that amount
    #   4. Compute % change in household net income if they took the job
    #   5. Apply extensive-margin participation elasticity → P(enter work)

    hh_net_income = _person_pop.household("household_net_income", YEAR).astype(float)

    # 9a — impute potential wages for inactive people from employed distribution
    emp_income = baseline.calculate("employment_income", YEAR).values.astype(float)

    # Wage-imputation age bands span legal minimum work age up to SPA-1.
    # The intermediate bands (24/34/49) are presentational; the upper bound
    # tracks SPA so the bands stay correctly aligned with working age.
    _age_bands = [(16, 24), (25, 34), (35, 49), (50, SPA - 1)]
    _median_wages = {}
    for lo, hi in _age_bands:
        for g in ["MALE", "FEMALE"]:
            m = is_employed & (age >= lo) & (age <= hi) & (gender_arr == g)
            if m.sum() > 0:
                median_wage = float(MicroSeries(emp_income[m], weights=person_weights[m]).median())
                if median_wage < 0:
                    raise ValueError(f"Negative median wage for age {lo}-{hi}, gender {g}")
                _median_wages[(lo, hi, g)] = median_wage
            else:
                raise ValueError(f"No employed people found for age {lo}-{hi}, gender {g}")

    potential_wage = np.zeros(len(age), dtype=float)
    for lo, hi in _age_bands:
        for g in ["MALE", "FEMALE"]:
            m = is_inactive & (age >= lo) & (age <= hi) & (gender_arr == g)
            potential_wage[m] = _median_wages[(lo, hi, g)]

    # 9b — employer NICs on potential wage (rate and threshold from PE parameters)
    _class_1 = baseline.tax_benefit_system.parameters(
        f"{YEAR}-01-01"
    ).gov.hmrc.national_insurance.class_1
    NICS_RATE = float(_class_1.rates.employer)
    SECONDARY_THRESHOLD = float(_class_1.thresholds.secondary_threshold) * 52  # weekly → annual
    print(
        f"  Employer NICs rate: {NICS_RATE:.1%}, secondary threshold: £{SECONDARY_THRESHOLD:,.0f}/year"
    )
    potential_nics = np.maximum(potential_wage - SECONDARY_THRESHOLD, 0) * NICS_RATE

    # With full pass-through: worker gets wage + nics saving
    potential_gross_with_exemption = potential_wage + potential_nics

    # 9c — marginal % change in net income from the NICs exemption only
    # The elasticity must be applied to the POLICY effect (the NICs saving),
    # not the total income gain from going inactive to employed.
    # Without the exemption, an inactive person could work and earn potential_wage.
    # With the exemption, they earn potential_wage + potential_nics (employer saving passed through).
    # The marginal gain from the policy = potential_nics (the NICs saving).
    # We express this as a % of net income if working WITHOUT the exemption.
    # PE's marginal_tax_rate variable cannot be used here because these people are
    # currently inactive with zero employment income.
    EFFECTIVE_MARGINAL_RATE = args.effective_marginal_rate
    net_nics_saving = potential_nics * (1 - EFFECTIVE_MARGINAL_RATE)
    net_income_if_working = hh_net_income + potential_wage * (1 - EFFECTIVE_MARGINAL_RATE)
    # Compute the % change in net income only for inactive working-age people —
    # the only population the policy applies to. A small number of inactive
    # people (typically tens out of millions) have non-positive
    # `net_income_if_working` due to extreme negative imputed household income
    # in PolicyEngine UK (e.g. self-employed loss imputations); we explicitly
    # exclude them and report the count instead of silently masking the divide.
    behav_mask = is_inactive & (net_income_if_working > 0)
    n_excluded_behav = int((is_inactive & ~behav_mask).sum())
    if n_excluded_behav:
        print(
            f"  Excluded {n_excluded_behav:,} inactive working-age people from "
            "behavioural calculation (non-positive net_income_if_working)."
        )
    pct_change_income = np.zeros_like(potential_wage)
    pct_change_income[behav_mask] = net_nics_saving[behav_mask] / net_income_if_working[behav_mask]

    # 9d — participation elasticity
    ELASTICITIES = {
        "low": args.elasticity_low,
        "central": args.elasticity_central,
        "high": args.elasticity_high,
    }

    behavioural_results = {}
    for label, elast in ELASTICITIES.items():
        prob_enter = np.clip(elast * pct_change_income, 0, 1)
        # Weight and sum
        n_new_entrants = float(
            MicroSeries((prob_enter * is_inactive).astype(float), weights=person_weights).sum()
        )
        # Additional NICs revenue from new entrants (they now pay NICs on their wage)
        # But they're exempt! So no new NICs from them — the gain is in income tax + less benefits
        # Fiscal offset: income tax + NI employee + reduced benefit spending
        tax_revenue_gain = (
            float(
                MicroSeries(
                    (prob_enter * is_inactive * potential_wage * EFFECTIVE_MARGINAL_RATE).astype(
                        float
                    ),
                    weights=person_weights,
                ).sum()
            )
            / 1e9
        )

        # By age group
        by_age_behav = []
        for lo, hi, age_label in [
            (16, 24, "16-24"),
            (25, 34, "25-34"),
            (35, 49, "35-49"),
            (50, 64, "50-64"),
        ]:
            m = is_inactive & (age >= lo) & (age <= hi)
            n = float(MicroSeries((prob_enter * m).astype(float), weights=person_weights).sum())
            by_age_behav.append({"age_group": age_label, "n_new_entrants": round(n)})

        # NEETs: 16-24, inactive and not in education
        is_student = np.isin(employment_status, ["STUDENT"])
        is_neet = is_inactive & (age >= 16) & (age <= 24) & ~is_student
        n_neets = float(MicroSeries(is_neet.astype(float), weights=person_weights).sum())
        n_neets_entering = float(
            MicroSeries((prob_enter * is_neet).astype(float), weights=person_weights).sum()
        )

        behavioural_results[label] = {
            "elasticity": elast,
            "n_new_entrants": round(n_new_entrants),
            "fiscal_offset_bn": round(tax_revenue_gain, 2),
            "net_cost_bn": round(nics_recently_active - tax_revenue_gain, 2),
            "by_age": by_age_behav,
            "n_neets_baseline": round(n_neets),
            "n_neets_entering_work": round(n_neets_entering),
        }
        print(
            f"  Elasticity {elast}: {n_new_entrants:,.0f} new entrants, "
            f"fiscal offset £{tax_revenue_gain:.2f}bn, "
            f"net cost £{nics_recently_active - tax_revenue_gain:.2f}bn"
        )

    # 9e — Poverty impact
    print("\nStep 9e: Poverty impact...")
    poverty_bhc = _person_pop.household("in_poverty_bhc", YEAR).astype(float)
    n_in_poverty_baseline = float(
        MicroSeries((poverty_bhc * working_age).astype(float), weights=person_weights).sum()
    )
    poverty_rate_baseline = round(
        n_in_poverty_baseline
        / float(MicroSeries(working_age.astype(float), weights=person_weights).sum())
        * 100,
        1,
    )

    poverty_line = _person_pop.household("poverty_line_bhc", YEAR).astype(float)
    poverty_gap = _person_pop.household("poverty_gap_bhc", YEAR).astype(float)

    # --- Static poverty impact ---
    # For already-employed recently-active workers: if the employer NICs saving
    # is passed through as higher wages, does it close their poverty gap?
    nics_saving_per_person = ni_employer.values.astype(float)  # their actual employer NICs
    static_net_gain = nics_saving_per_person * (1 - EFFECTIVE_MARGINAL_RATE)
    static_lifted = (
        recent_prob * working_age * poverty_bhc.astype(bool) * (static_net_gain > poverty_gap)
    ).astype(float)
    n_lifted_static = float(MicroSeries(static_lifted, weights=person_weights).sum())
    print(f"  Static poverty reduction: {n_lifted_static:,.0f} people lifted out")

    static_poverty_impact = {
        "n_lifted_out_of_poverty": round(n_lifted_static),
    }

    # --- Behavioural poverty impact ---
    # For central elasticity: inactive people entering work gain their full wage (net of tax)
    # If that net wage gain > poverty_gap, they exit poverty
    net_gain_if_working = potential_gross_with_exemption * (1 - EFFECTIVE_MARGINAL_RATE)

    central_prob = np.clip(ELASTICITIES["central"] * pct_change_income, 0, 1)
    # People lifted out of poverty: inactive, in poverty, and net wage gain > poverty_gap
    lifted_out = (
        central_prob * is_inactive * poverty_bhc * (net_gain_if_working > poverty_gap)
    ).astype(float)
    n_lifted_out = float(MicroSeries(lifted_out, weights=person_weights).sum())
    # Also count household members lifted out (approximate: multiply by avg hh size for poor)
    # For simplicity, report individual-level only
    poverty_rate_reform = round(
        (n_in_poverty_baseline - n_lifted_out)
        / float(MicroSeries(working_age.astype(float), weights=person_weights).sum())
        * 100,
        1,
    )

    print(f"  Working-age poverty rate: {poverty_rate_baseline}% → {poverty_rate_reform}%")
    print(f"  People lifted out of poverty (behavioural): {n_lifted_out:,.0f}")

    poverty_impact = {
        "poverty_rate_baseline_pct": poverty_rate_baseline,
        "poverty_rate_reform_pct": poverty_rate_reform,
        "n_lifted_out_of_poverty": round(n_lifted_out),
    }

    # ── Step 10: Counterfactual — disability benefit cuts ─────────────────

    print("\nStep 10: Counterfactual — disability benefit cuts...")

    # Model the government's proposed disability benefit reforms as a proportional
    # cut to PIP/DLA for working-age recipients. The cut rate is either passed in
    # directly via --benefit-cut-rate or back-solved from --benefit-cut-target-bn so
    # the modelled fiscal saving matches a published government target.
    pip_person = baseline.calculate("pip", YEAR).values.astype(float)
    dla_person = baseline.calculate("dla", YEAR).values.astype(float)

    pip_dla_wa_total_bn = (
        float(MicroSeries((pip_person + dla_person) * working_age, weights=person_weights).sum())
        / 1e9
    )

    if args.benefit_cut_target_bn is not None:
        CUT_RATE = args.benefit_cut_target_bn / pip_dla_wa_total_bn
        print(f"  PIP+DLA working-age total in model: £{pip_dla_wa_total_bn:.2f}bn")
        print(
            f"  Auto-calibrated cut rate: {CUT_RATE * 100:.1f}% to match "
            f"£{args.benefit_cut_target_bn}bn fiscal-saving target"
        )
    else:
        CUT_RATE = args.benefit_cut_rate
        print(
            f"  Using explicit cut rate {CUT_RATE * 100:.1f}% on PIP+DLA "
            f"(working-age total in model: £{pip_dla_wa_total_bn:.2f}bn)"
        )

    benefit_loss = (pip_person + dla_person) * CUT_RATE  # annual loss per person

    # Sum benefit loss at the household level so we compare household income
    # drop (all members' PIP/DLA cuts combined) against household poverty line.
    # `_person_pop.household.sum(...)` aggregates person values to household and
    # returns a person-shaped array (the household total broadcast back to each
    # member), which is exactly the input shape we need downstream.
    hh_benefit_loss = _person_pop.household.sum(benefit_loss)

    # Only disabled inactive working-age people experience the income-effect
    # response. Non-disabled and non-inactive people don't receive PIP/DLA so
    # the cut doesn't affect them. A small number of edge-case households have
    # non-positive net income in PolicyEngine UK; we exclude them explicitly
    # rather than silently masking the divide.
    is_disabled_inactive = is_inactive & is_disabled_broad & working_age
    cf_mask = is_disabled_inactive & (hh_net_income > 0)
    n_excluded_cf = int((is_disabled_inactive & ~cf_mask).sum())
    if n_excluded_cf:
        print(
            f"  Excluded {n_excluded_cf:,} disabled-inactive people from "
            "counterfactual (non-positive household net income)."
        )
    pct_change_cf = np.zeros_like(hh_net_income)
    pct_change_cf[cf_mask] = -hh_benefit_loss[cf_mask] / hh_net_income[cf_mask]

    # Income effect: lower income → may need to work (positive participation response
    # to income loss). Use same elasticity framework but note the sign:
    # A negative income shock with positive participation elasticity means people
    # are pushed into the labour market.
    BENEFIT_CUT_ELAST = args.benefit_cut_elasticity
    prob_enter_cf = np.clip(BENEFIT_CUT_ELAST * np.abs(pct_change_cf), 0, 1)
    # pct_change_cf is already zero outside is_disabled_inactive, so prob_enter_cf
    # naturally restricts to the affected population — no extra mask needed.

    n_entering_cf = float(MicroSeries(prob_enter_cf.astype(float), weights=person_weights).sum())
    fiscal_saving_cf = (
        float(MicroSeries((benefit_loss * working_age).astype(float), weights=person_weights).sum())
        / 1e9
    )

    # Poverty impact of benefit cuts (people losing income → more poverty)
    # Use household-level total loss so multi-recipient households are handled correctly
    benefit_cut_pushes_into_poverty = (
        ~poverty_bhc.astype(bool)
        & working_age
        & ((hh_net_income - hh_benefit_loss) < poverty_line)
        & (hh_benefit_loss > 0)
    ).astype(float)
    n_pushed_into_poverty = float(
        MicroSeries(benefit_cut_pushes_into_poverty, weights=person_weights).sum()
    )

    # Count working-age PIP/DLA recipients (people affected by the cuts)
    is_pip_dla_recipient = ((pip_person + dla_person) > 0) & working_age
    n_pip_dla_recipients = float(
        MicroSeries(is_pip_dla_recipient.astype(float), weights=person_weights).sum()
    )

    print(f"  Working-age PIP/DLA recipients: {n_pip_dla_recipients:,.0f}")
    print(f"  Benefit cut fiscal saving: £{fiscal_saving_cf:.2f}bn")
    print(f"  People entering work (income effect): {n_entering_cf:,.0f}")
    print(f"  People pushed into poverty: {n_pushed_into_poverty:,.0f}")

    counterfactual = {
        "name": "Disability benefit cuts (PIP/DLA reduction)",
        "cut_rate_pct": round(CUT_RATE * 100, 1),
        "cut_rate_calibrated_to_bn": args.benefit_cut_target_bn,
        "pip_dla_working_age_total_bn": round(pip_dla_wa_total_bn, 2),
        "fiscal_saving_bn": round(fiscal_saving_cf, 2),
        "n_entering_work": round(n_entering_cf),
        "n_pushed_into_poverty": round(n_pushed_into_poverty),
        "n_affected": round(n_pip_dla_recipients),
    }

    # ── Step 11: Income decile breakdown ──────────────────────────────────

    print("\nStep 11: Income decile breakdown...")
    equiv_hh_income = _person_pop.household("equiv_household_net_income", YEAR).astype(float)

    # Compute deciles from the working-age population
    wa_income_ms = MicroSeries(equiv_hh_income[working_age], weights=person_weights[working_age])
    decile_thresholds = [float(wa_income_ms.quantile(d / 10)) for d in range(1, 10)]

    # Assign deciles to all people (1-indexed: 1=poorest, 10=richest)
    decile = np.digitize(equiv_hh_income, decile_thresholds, right=True) + 1
    decile = np.clip(decile, 1, 10)

    by_income_decile = []
    for d in range(1, 11):
        m = (decile == d) & is_inactive & working_age
        n_inactive_d = float(MicroSeries(m.astype(float), weights=person_weights).sum())
        n_entering_d = float(
            MicroSeries((central_prob * m).astype(float), weights=person_weights).sum()
        )
        by_income_decile.append(
            {
                "decile": d,
                "n_inactive": round(n_inactive_d),
                "n_entering_work": round(n_entering_d),
            }
        )
        if d in [1, 5, 10]:
            print(f"  Decile {d}: {n_inactive_d:,.0f} inactive, {n_entering_d:,.0f} entering work")

    # Also build static breakdowns by income and wealth decile (for the detailed table)
    def _build_decile_breakdown(decile_arr, label_prefix):
        rows = []
        for d in range(1, 11):
            m = (decile_arr == d) & is_working_age
            m_recent = is_recent * m
            n_recent = float(MicroSeries(m_recent, weights=person_weights).sum())
            nics_cost = float(
                MicroSeries(efrs_imp.ni_employer.values * m_recent, weights=person_weights).sum()
                / 1e9
            )
            rows.append(
                {
                    "group": str(d),
                    "n_recently_active": round(n_recent),
                    "nics_exemption_cost_bn": round(nics_cost, 2),
                }
            )
        return rows

    by_income_decile_static = _build_decile_breakdown(decile, "Decile")

    # Wealth decile
    print("\nStep 11b: Wealth decile breakdown...")
    total_wealth = _person_pop.household("total_wealth", YEAR).astype(float)
    wa_wealth_ms = MicroSeries(total_wealth[working_age], weights=person_weights[working_age])
    wealth_thresholds = [float(wa_wealth_ms.quantile(d / 10)) for d in range(1, 10)]

    wealth_decile = np.digitize(total_wealth, wealth_thresholds, right=True) + 1
    wealth_decile = np.clip(wealth_decile, 1, 10)

    by_wealth_decile_static = _build_decile_breakdown(wealth_decile, "Decile")

    by_wealth_decile_behav = []
    for d in range(1, 11):
        m = (wealth_decile == d) & is_inactive & working_age
        n_inactive_d = float(MicroSeries(m.astype(float), weights=person_weights).sum())
        n_entering_d = float(
            MicroSeries((central_prob * m).astype(float), weights=person_weights).sum()
        )
        by_wealth_decile_behav.append(
            {
                "decile": d,
                "n_inactive": round(n_inactive_d),
                "n_entering_work": round(n_entering_d),
            }
        )
        if d in [1, 5, 10]:
            print(
                f"  Wealth decile {d}: {n_inactive_d:,.0f} inactive, {n_entering_d:,.0f} entering work"
            )

    # ── Step 12: Write results JSON ───────────────────────────────────────

    print("\nStep 12: Writing results JSON...")

    output = {
        "year": YEAR,
        "settings": {
            "effective_marginal_rate": EFFECTIVE_MARGINAL_RATE,
            "elasticities": ELASTICITIES,
            "benefit_cut_rate": round(CUT_RATE, 4),
            "benefit_cut_target_bn": args.benefit_cut_target_bn,
            "benefit_cut_elasticity": BENEFIT_CUT_ELAST,
        },
        "baseline": {
            "summary": {
                "n_economically_inactive": round(n_economically_inactive),
                "n_disabled": round(n_disabled),
                "n_inactive_disabled": round(n_inactive_disabled),
                "total_employer_nics_bn": round(total_nics, 1),
                "total_disability_benefits_bn": round(total_disability_benefits_bn, 1),
                "disabled_employment_rate": dis_emp_rate,
                "non_disabled_employment_rate": non_dis_emp_rate,
                "disability_employment_gap_pp": disability_emp_gap,
                "pct_inactive_disabled": pct_inactive_disabled,
                "avg_nics_per_worker": avg_nics_per_worker,
            },
            "by_age": age_data,
            "inactivity_reasons": inactivity_reasons,
            "by_region": [],
            "poverty": {
                "rate_pct": poverty_rate_baseline,
                "n_in_poverty": round(n_in_poverty_baseline),
            },
        },
        "nics_exemption": {
            "total_employer_nics_bn": round(total_nics, 1),
            "nics_recently_active_bn": round(nics_recently_active, 2),
            "nics_not_recently_active_bn": round(nics_not_recently_active, 2),
        },
        "reform": {
            "nics_exemption": {
                "static": {
                    "cost_bn": round(nics_recently_active, 1),
                    "avg_nics_per_recent_worker": avg_nics_per_recent,
                    "poverty_impact": static_poverty_impact,
                },
                "behavioural": behavioural_results,
                "poverty_impact": poverty_impact,
                "by_age": [
                    {
                        "age_group": d["age_group"],
                        "n_recently_active": d["n_recently_active"],
                        "nics_exemption_cost_bn": d["nics_exemption_cost_bn"],
                    }
                    for d in age_data
                    if d["age_group"] != "65+"
                ],
                "by_gender": by_gender,
                "by_country": by_country,
                "by_family_type": by_family,
                "by_income_decile": by_income_decile_static,
                "by_wealth_decile": by_wealth_decile_static,
                "by_income_decile_behavioural": by_income_decile,
                "by_wealth_decile_behavioural": by_wealth_decile_behav,
            },
            "counterfactual_benefit_cuts": counterfactual,
        },
        "pct_active_by_age_lfs": {
            str(int(k)): round(float(v), 4)
            for k, v in pct_active_by_age_lfs.items()
            if not np.isnan(v)
        },
        "pct_active_by_age": {
            str(int(k)): round(float(v), 4) for k, v in pct_active_by_age.items() if not np.isnan(v)
        },
    }

    # Write to both data/ and dashboard/
    for path in [
        Path("data/nics_exemption_results.json"),
        Path("dashboard/public/data/nics_exemption_results.json"),
    ]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(output, indent=2, default=str) + "\n")
        print(f"  Written to {path}")

    print("\nDone!")
