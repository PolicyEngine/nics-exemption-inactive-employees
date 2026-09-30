"""Working age and the State Pension age boundary, read from PolicyEngine UK.

State Pension age is set by date of birth (Pensions Act 1995 Schedule 4
paragraph 1, as amended by the Pensions Acts 2007, 2011 and 2014). From
2026-27 people born from 6 April 1960 reach it after their 66th birthday, so
in a given year some people of one whole age are over it and others are not.
The pipeline therefore reads each person's status from PolicyEngine UK's
``is_SP_age`` and derives every age cut-off from that status, rather than from
a single State Pension age.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# The legal minimum age for full-time work.
MINIMUM_WORKING_AGE = 16
# Present in PolicyEngine UK from the release that sets State Pension age by
# date of birth (policyengine-uk#1899); older releases hold it at 66 forever.
DATE_OF_BIRTH_MARKER = "months_since_state_pension_age"


def require_date_of_birth_state_pension_age(tax_benefit_system) -> None:
    """Refuse an engine that still holds State Pension age at one age.

    Such an engine runs the pipeline without error but keeps every
    66-year-old over State Pension age in 2026-27 and later, so the working-age
    population and every figure built on it would be silently wrong.
    """
    if DATE_OF_BIRTH_MARKER not in tax_benefit_system.variables:
        raise RuntimeError(
            "This PolicyEngine UK sets one State Pension age for everyone; the "
            "pipeline needs the release that sets it by date of birth "
            "(policyengine-uk#1899). Install the engine extra: "
            'uv pip install -e ".[simulation]".'
        )


def working_age_mask(
    age: np.ndarray,
    is_sp_age: np.ndarray,
    minimum_age: int = MINIMUM_WORKING_AGE,
) -> np.ndarray:
    """People aged ``minimum_age`` or over who are under State Pension age."""
    return (np.asarray(age, dtype=float) >= minimum_age) & ~np.asarray(is_sp_age, dtype=bool)


@dataclass(frozen=True)
class StatePensionAgeBoundary:
    """Where State Pension age falls, by whole age, in one modelled year.

    ``youngest_over`` is the lowest whole age at which anyone is over State
    Pension age and ``oldest_under`` the highest whole age at which anyone of
    working age is under it. Ages from ``youngest_over`` to ``oldest_under``
    are split, and ``share_under`` holds the weighted share of each such age
    that is under State Pension age.
    """

    youngest_over: int
    oldest_under: int
    share_under: dict[int, float]

    @property
    def pension_age_label(self) -> str:
        """Label for the group over State Pension age, e.g. ``"66+"``."""
        return f"{self.youngest_over}+"

    def under_share(self, age: np.ndarray) -> np.ndarray:
        """The share of people of each whole age who are under State Pension age.

        Ages below ``youngest_over`` are all under it and ages above
        ``oldest_under`` all over it. This carries the engine's status to data
        without it, such as the Labour Force Survey, where only age is known.
        """
        whole = np.floor(np.asarray(age, dtype=float))
        share = np.where(whole < self.youngest_over, 1.0, 0.0)
        for split_age, value in self.share_under.items():
            share = np.where(whole == split_age, value, share)
        return share


def state_pension_age_boundary(
    age: np.ndarray,
    is_sp_age: np.ndarray,
    weights: np.ndarray,
    minimum_age: int = MINIMUM_WORKING_AGE,
) -> StatePensionAgeBoundary:
    """Summarise per-person State Pension age status by whole age."""
    whole = np.floor(np.asarray(age, dtype=float))
    over = np.asarray(is_sp_age, dtype=bool)
    weights = np.asarray(weights, dtype=float)
    under = ~over & (whole >= minimum_age)
    if not over.any():
        raise ValueError("No one is over State Pension age; the status looks wrong.")
    if not under.any():
        raise ValueError("No one of working age is under State Pension age.")
    youngest_over = int(whole[over].min())
    oldest_under = int(whole[under].max())
    share_under = {}
    for split_age in range(youngest_over, oldest_under + 1):
        at_age = whole == split_age
        total = weights[at_age].sum()
        if total <= 0:
            raise ValueError(f"No weight at age {split_age}, where State Pension age is split.")
        share_under[split_age] = float(weights[at_age & ~over].sum() / total)
    return StatePensionAgeBoundary(
        youngest_over=youngest_over,
        oldest_under=oldest_under,
        share_under=share_under,
    )


def working_age_bands(boundary: StatePensionAgeBoundary) -> list[tuple[int, int, str]]:
    """Age bands spanning working age: 16-24, 25-34, 35-49 and 50 up to the
    oldest age at which anyone is under State Pension age."""
    return [
        (MINIMUM_WORKING_AGE, 24, f"{MINIMUM_WORKING_AGE}-24"),
        (25, 34, "25-34"),
        (35, 49, "35-49"),
        (50, boundary.oldest_under, f"50-{boundary.oldest_under}"),
    ]


def age_groups(
    age: np.ndarray,
    is_sp_age: np.ndarray,
    boundary: StatePensionAgeBoundary,
) -> list[tuple[str, np.ndarray]]:
    """Working-age bands, then everyone over State Pension age.

    Groups follow each person's status, so at an age where State Pension age
    is split each person falls in the working-age band or the pension-age
    group, never both. The pension-age group is labelled from the youngest
    age at which anyone is over State Pension age, e.g. ``"66+"``.
    """
    age = np.asarray(age, dtype=float)
    over = np.asarray(is_sp_age, dtype=bool)
    groups = [
        (label, (age >= lo) & (age < hi + 1) & ~over)
        for lo, hi, label in working_age_bands(boundary)
    ]
    groups.append((boundary.pension_age_label, over))
    return groups
