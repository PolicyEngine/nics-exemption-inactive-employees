"""The pipeline's State Pension age reading against PolicyEngine UK itself.

The pipeline builds a Microsimulation from microdata, where PolicyEngine UK
spreads each whole age's birthdays over the year, so from 2026-27 the rise to
67 splits the 66-year-olds. This test builds a small data-built simulation the
same way and checks the pipeline's working age and boundary follow the engine.
"""

import numpy as np
import pandas as pd
import pytest

policyengine_uk = pytest.importorskip("policyengine_uk")

from nics_exemption.state_pension import (  # noqa: E402
    age_groups,
    state_pension_age_boundary,
    working_age_mask,
)

# Each age has this many people, half men and half women, so every age and sex
# stratum is spread over the year.
PEOPLE_PER_AGE = 200


def _microsimulation(year: int):
    from policyengine_uk import Microsimulation
    from policyengine_uk.data import UKSingleYearDataset

    ages = np.repeat([40, 65, 66, 67, 70], PEOPLE_PER_AGE)
    ids = np.arange(len(ages)) + 1
    person = pd.DataFrame(
        {
            "person_id": ids,
            "person_benunit_id": ids,
            "person_household_id": ids,
            "age": ages,
            "gender": np.where(ids % 2 == 0, "MALE", "FEMALE"),
        }
    )
    benunit = pd.DataFrame({"benunit_id": ids})
    household = pd.DataFrame(
        {
            "household_id": ids,
            "household_weight": 1.0 + ids % 3,
            "region": "LONDON",
            "council_tax": 0.0,
            "rent": 0.0,
            "tenure_type": "OWNED_OUTRIGHT",
        }
    )
    dataset = UKSingleYearDataset(
        person=person, benunit=benunit, household=household, fiscal_year=year
    )
    return Microsimulation(dataset=dataset)


def _read(year: int):
    simulation = _microsimulation(year)
    age = simulation.calculate("age", year).values
    is_sp_age = simulation.calculate("is_SP_age", year).values.astype(bool)
    weights = simulation.calculate("person_weight", year).values
    return age, is_sp_age, weights


@pytest.mark.parametrize(
    ("year", "share_of_66_under", "pension_age_label", "oldest_band"),
    [
        # Before the rise every 66-year-old is over State Pension age.
        (2025, None, "66+", "50-65"),
        # About a quarter of 66-year-olds are under it in 2026-27 and three
        # quarters in 2027-28 (people born from 6 April 1960 reach it at 66
        # years and 1 to 11 months, or at 67 from 6 March 1961).
        (2026, 0.25, "66+", "50-66"),
        (2027, 0.75, "66+", "50-66"),
        # From 2028-29 no one reaches it before 67.
        (2028, None, "67+", "50-66"),
    ],
)
def test_pipeline_follows_the_engine_state_pension_age(
    year, share_of_66_under, pension_age_label, oldest_band
):
    age, is_sp_age, weights = _read(year)

    boundary = state_pension_age_boundary(age, is_sp_age, weights)
    working_age = working_age_mask(age, is_sp_age)

    assert not working_age[age == 70].any()
    assert not working_age[age == 67].any()
    assert working_age[age == 65].all()
    assert working_age[age == 40].all()
    assert boundary.pension_age_label == pension_age_label
    groups = age_groups(age, is_sp_age, boundary)
    assert groups[-2][0] == oldest_band
    if share_of_66_under is None:
        assert boundary.share_under == {}
    else:
        assert set(boundary.share_under) == {66}
        # Birthdays are spread by weight, so the share is exact to within
        # about a month of births (1/12) at this sample size.
        assert boundary.share_under[66] == pytest.approx(share_of_66_under, abs=1 / 12)
        # Working age agrees with the weighted share at 66.
        at_66 = age == 66
        share = np.average(working_age[at_66], weights=weights[at_66])
        assert share == pytest.approx(boundary.share_under[66])
