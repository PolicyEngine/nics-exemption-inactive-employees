import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from nics_exemption.state_pension import (
    MINIMUM_WORKING_AGE,
    age_groups,
    require_date_of_birth_state_pension_age,
    state_pension_age_boundary,
    working_age_bands,
    working_age_mask,
)


def test_working_age_is_16_and_over_and_under_state_pension_age():
    age = np.array([15, 16, 40, 66, 66, 67])
    is_sp_age = np.array([False, False, False, False, True, True])

    assert working_age_mask(age, is_sp_age).tolist() == [False, True, True, True, False, False]


def test_boundary_before_the_rise_to_67():
    # 2025-26: everyone aged 66 is over State Pension age, no one aged 65 is.
    age = np.array([40, 65, 65, 66, 66, 70])
    is_sp_age = np.array([False, False, False, True, True, True])

    boundary = state_pension_age_boundary(age, is_sp_age, np.ones(6))

    assert boundary.youngest_over == 66
    assert boundary.oldest_under == 65
    assert boundary.share_under == {}
    assert boundary.pension_age_label == "66+"
    assert working_age_bands(boundary)[-1] == (50, 65, "50-65")
    assert boundary.under_share(np.array([16, 65, 66, 90])).tolist() == [1.0, 1.0, 0.0, 0.0]


def test_boundary_where_66_year_olds_are_split():
    # 2026-27: three quarters of 66-year-olds (by weight) are over State
    # Pension age.
    age = np.array([40, 65, 66, 66, 66, 67])
    is_sp_age = np.array([False, False, True, True, False, True])
    weights = np.array([1.0, 1.0, 2.0, 1.0, 1.0, 1.0])

    boundary = state_pension_age_boundary(age, is_sp_age, weights)

    assert boundary.youngest_over == 66
    assert boundary.oldest_under == 66
    assert boundary.share_under == {66: 0.25}
    assert boundary.pension_age_label == "66+"
    assert working_age_bands(boundary)[-1] == (50, 66, "50-66")
    assert boundary.under_share(np.array([65, 66, 67])).tolist() == [1.0, 0.25, 0.0]

    groups = dict(age_groups(age, is_sp_age, boundary))
    assert groups["50-66"].tolist() == [False, True, False, False, True, False]
    assert groups["66+"].tolist() == [False, False, True, True, False, True]


def test_boundary_after_the_rise_to_67():
    # 2028-29: no one aged 66 is over State Pension age.
    age = np.array([66, 66, 67])
    is_sp_age = np.array([False, False, True])

    boundary = state_pension_age_boundary(age, is_sp_age, np.ones(3))

    assert (boundary.youngest_over, boundary.oldest_under) == (67, 66)
    assert boundary.pension_age_label == "67+"
    assert working_age_bands(boundary)[-1] == (50, 66, "50-66")


def test_boundary_refuses_a_status_with_no_one_on_one_side():
    with pytest.raises(ValueError, match="No one is over"):
        state_pension_age_boundary(np.array([40, 70]), np.array([False, False]), np.ones(2))
    with pytest.raises(ValueError, match="No one of working age"):
        state_pension_age_boundary(np.array([10, 70]), np.array([False, True]), np.ones(2))


def test_boundary_refuses_a_split_age_without_weight():
    # Age 66 lies between the youngest over (65) and the oldest under (67)
    # State Pension age but has no weight, so its share is undefined.
    with pytest.raises(ValueError, match="No weight at age 66"):
        state_pension_age_boundary(
            np.array([65, 66, 67]), np.array([True, False, False]), np.array([1.0, 0.0, 1.0])
        )


# A population with a monotone State Pension age status: everyone from some
# whole age is over it, no one below another, and ages between are split.
@st.composite
def populations(draw):
    n = draw(st.integers(min_value=2, max_value=60))
    youngest_over = draw(st.integers(min_value=60, max_value=68))
    oldest_under = draw(st.integers(min_value=youngest_over - 1, max_value=youngest_over + 1))
    ages = np.array(draw(st.lists(st.integers(0, 100), min_size=n, max_size=n)), dtype=float)
    weights = np.array(draw(st.lists(st.floats(0.1, 1000.0), min_size=n, max_size=n)), dtype=float)
    coins = np.array(draw(st.lists(st.booleans(), min_size=n, max_size=n)))
    is_sp_age = np.where(ages < youngest_over, False, np.where(ages > oldest_under, True, coins))
    # Anchor both sides so the boundary is defined.
    ages = np.concatenate([ages, [40.0, 90.0]])
    weights = np.concatenate([weights, [1.0, 1.0]])
    is_sp_age = np.concatenate([is_sp_age, [False, True]])
    return ages, is_sp_age, weights


@given(populations())
def test_age_groups_partition_everyone_of_working_age_or_over(population):
    ages, is_sp_age, weights = population
    boundary = state_pension_age_boundary(ages, is_sp_age, weights)
    groups = age_groups(ages, is_sp_age, boundary)

    membership = np.sum([mask for _, mask in groups], axis=0)
    in_scope = working_age_mask(ages, is_sp_age) | is_sp_age

    # Every person of working age or over State Pension age is in exactly one
    # group, and no one else is in any.
    assert (membership == in_scope.astype(int)).all()
    # The working-age bands hold exactly the working-age population.
    working = np.sum([mask for label, mask in groups[:-1]], axis=0)
    assert (working.astype(bool) == working_age_mask(ages, is_sp_age)).all()
    assert groups[-1][0].endswith("+")


@given(populations())
def test_under_share_carries_the_working_age_total_to_age_only_data(population):
    ages, is_sp_age, weights = population
    boundary = state_pension_age_boundary(ages, is_sp_age, weights)

    share = boundary.under_share(ages)
    assert ((share >= 0) & (share <= 1)).all()
    # Applied to the same people, weighting by age alone reproduces the
    # weighted working-age total the engine's per-person status gives.
    carried = np.sum(weights * share * (ages >= MINIMUM_WORKING_AGE))
    direct = np.sum(weights * working_age_mask(ages, is_sp_age))
    assert carried == pytest.approx(direct, rel=1e-9)


def test_an_engine_with_one_state_pension_age_is_refused():
    class _System:
        def __init__(self, variables):
            self.variables = dict.fromkeys(variables)

    with pytest.raises(RuntimeError, match="by date of birth"):
        require_date_of_birth_state_pension_age(_System(["age", "is_SP_age"]))
    require_date_of_birth_state_pension_age(
        _System(["age", "is_SP_age", "months_since_state_pension_age"])
    )
