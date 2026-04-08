import numpy as np
from microdf import MicroDataFrame

from nics_exemption.analysis import (
    build_baseline_summary,
    build_nics_by_age,
    build_nics_by_disability,
    build_nics_by_income_decile,
    compute_cost_effectiveness,
    estimate_employment_entry_effect,
    build_full_analysis,
)


def _make_sample_df(n=100):
    """Create a small sample MicroDataFrame for testing."""
    rng = np.random.default_rng(42)
    ages = rng.integers(16, 70, size=n)
    income = rng.uniform(0, 50000, size=n).astype(np.float32)
    # Zero out income for some to simulate unemployed
    income[ages < 18] = 0
    ni = (income * 0.138).clip(min=0).astype(np.float32)
    disabled = rng.choice([True, False], size=n, p=[0.15, 0.85])
    recently_active = rng.choice([0.0, 1.0], size=n, p=[0.85, 0.15]).astype(np.float32)
    recently_active[ages < 16] = 0.0
    weights = np.ones(n, dtype=np.float64) * 1000

    return MicroDataFrame(
        {
            "age": ages.astype(np.float32),
            "employment_income": income,
            "ni_employer": ni,
            "is_disabled": disabled,
            "joined_labour_force_recently": recently_active,
        },
        weights=weights,
    )


def test_build_baseline_summary():
    df = _make_sample_df()
    summary = build_baseline_summary(df)

    assert "total_employer_nics_bn" in summary
    assert "n_working_age" in summary
    assert "n_employed" in summary
    assert "n_disabled" in summary
    assert summary["n_working_age"] > 0
    assert summary["total_employer_nics_bn"] >= 0


def test_build_nics_by_age():
    df = _make_sample_df()
    rows = build_nics_by_age(df)

    assert len(rows) == 5
    assert rows[0]["age_group"] == "16-24"
    assert rows[-1]["age_group"] == "65+"
    for row in rows:
        assert "n_total" in row
        assert "nics_exemption_cost_bn" in row
        assert row["pct_recently_active"] >= 0
        assert row["pct_recently_active"] <= 100


def test_build_nics_by_income_decile():
    df = _make_sample_df(200)
    rows = build_nics_by_income_decile(df)

    assert len(rows) == 10
    assert rows[0]["decile"] == 1
    assert rows[9]["decile"] == 10
    for row in rows:
        assert "total_nics_bn" in row
        assert "avg_employment_income" in row


def test_build_nics_by_disability():
    df = _make_sample_df()
    result = build_nics_by_disability(df)

    assert "disabled" in result
    assert "not_disabled" in result
    assert result["disabled"]["n_employed"] >= 0
    assert result["not_disabled"]["n_employed"] >= 0


def test_compute_cost_effectiveness():
    result = compute_cost_effectiveness(
        exemption_cost_bn=2.5,
        n_target_employees=500_000,
    )
    assert result["total_cost_bn"] == 2.5
    assert result["n_target_employees"] == 500_000
    assert result["cost_per_employee"] == 5000


def test_compute_cost_effectiveness_zero_employees():
    import pytest

    with pytest.raises(ValueError):
        compute_cost_effectiveness(
            exemption_cost_bn=1.0,
            n_target_employees=0,
        )


def test_estimate_employment_entry_effect():
    result = estimate_employment_entry_effect(
        exemption_cost_bn=2.0,
        elasticity=0.2,
        n_inactive=5_000_000,
        employer_nics_rate=0.15,
    )
    assert result["elasticity"] == 0.2
    assert result["additional_entries"] > 0
    assert result["cost_per_additional_entry"] > 0


def test_build_full_analysis():
    df = _make_sample_df()
    analysis = build_full_analysis(df)

    assert "summary" in analysis
    assert "by_age" in analysis
    assert "by_income_decile" in analysis
    assert "by_disability" in analysis
    assert "cost_effectiveness" in analysis
