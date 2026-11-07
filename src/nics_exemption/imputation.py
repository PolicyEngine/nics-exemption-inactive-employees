"""Recently-active status as a calibrated probability for each working-age person.

The LFS five-quarter panel shows who moved from economic inactivity into work
within its window (``joined_labour_force_recently``, built in :mod:`.lfs`).
This module carries that status onto the PolicyEngine population:

1. A weighted classifier (microcosm-fit's ``CategoricalClassifier``) learns
   P(joined recently | age, gender, employment income) from the panel members
   whose pay the LFS records, and gives every person a probability.
2. Within each working-age band, one factor scales those probabilities so that
   their weighted mean matches the share the panel measures for that band,
   capping each probability at 1. Every panel member in the band, missing pay
   included, counts toward the target, so dropping missing-pay donors from the
   fit cannot move the level.

Everyone else gets 0: we cost the reform for working-age employees, and the
panel holds no one older than 70.

Step 1 has to yield probabilities: no scaling can lift the share of a 0/1
class label above the share of people labelled 1.
``analysis/recently-active-labels/`` measures what class labels did to the
results published on 2026-06-12.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import pandas as pd
from microdf import MicroSeries

PREDICTORS = ["age", "gender", "employment_income"]
TARGET = "joined_labour_force_recently"
#: Seeds the classifier's boosted learner (its spline logit draws nothing at
#: random), so a rerun on the same panel and package versions repeats the
#: probabilities.
CLASSIFIER_SEED = 0

#: Bisection steps for the calibration factor. Each step halves the bracket's
#: log-width, so even a bracket spanning the whole float range closes to
#: adjacent floats in about 65 steps.
_CALIBRATION_STEPS = 200
#: Slack for rounding when the target equals the most any factor can reach.
_SHARE_TOLERANCE = 1e-12


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    """Survey-weighted mean via microdf."""
    return float(MicroSeries(np.asarray(values, dtype=float), weights=weights).mean())


def calibrate(
    prob: np.ndarray,
    treated_mask: np.ndarray,
    person_weights: np.ndarray,
    target_share: float,
) -> np.ndarray:
    """Scale treated probabilities by one factor so their weighted mean hits the target.

    Each treated person gets ``min(f * p, 1)`` for the one factor ``f`` that
    makes the weighted mean over treated people equal ``target_share``;
    everyone else gets 0. When no scaled probability reaches 1, ``f`` is the
    plain ratio ``target_share / mean(p)``. When some do reach 1, clipping them
    alone would leave the mean short of the target, so ``f`` grows until the
    people below 1 make up the difference. The weighted mean of
    ``min(f * p, 1)`` rises continuously in ``f``, so bisection finds it; the
    bisection splits the bracket at its geometric midpoint, since the bracket
    can span many orders of magnitude.

    Raises:
        ValueError: If a treated probability lies outside [0, 1], a treated
            weight is negative or non-finite, the treated weights sum to zero,
            the target lies outside [0, 1], the probabilities are zero across
            the treated population while the target is positive, or the target
            exceeds the weighted share of treated people with a nonzero
            probability (the most any factor reaches). The last one means the
            imputation returned too few nonzero values, as 0/1 class labels do.
    """
    treated_mask = np.asarray(treated_mask, dtype=bool)
    prob = np.where(treated_mask, np.asarray(prob, dtype=float), 0.0)
    p = prob[treated_mask]
    w = np.asarray(person_weights, dtype=float)[treated_mask]
    if not (np.isfinite(p).all() and (p >= 0).all() and (p <= 1).all()):
        raise ValueError("Imputed probabilities must lie in [0, 1] for treated people.")
    if not (np.isfinite(w).all() and (w >= 0).all() and w.sum() > 0):
        raise ValueError("Treated person weights must be finite, non-negative and not all zero.")
    if not 0.0 <= target_share <= 1.0:
        raise ValueError(f"The target share must lie in [0, 1], not {target_share}.")
    if target_share == 0.0:
        return np.zeros_like(prob)
    uncalibrated = weighted_mean(p, w)
    if uncalibrated <= 0:
        raise ValueError(
            "Imputed probabilities are zero across the treated population; "
            "cannot calibrate to the measured share."
        )
    factor = target_share / uncalibrated
    if factor * p.max() <= 1.0:
        return prob * factor

    reachable = weighted_mean((p > 0).astype(float), w)
    if target_share > reachable + _SHARE_TOLERANCE:
        raise ValueError(
            f"No scaling of the imputed probabilities reaches the target share "
            f"{target_share:.6f}: only {reachable:.6f} of the treated weight has a "
            "nonzero probability. 0/1 class labels in place of probabilities do this."
        )
    # The weighted mean sits below the target at ``low`` (the clip binds there)
    # and reaches every reachable share at ``high`` (every nonzero p at 1).
    low, high = factor, 1.0 / p[p > 0].min()
    for _ in range(_CALIBRATION_STEPS):
        middle = float(np.sqrt(low) * np.sqrt(high))
        if middle <= low or middle >= high:
            break
        if weighted_mean(np.minimum(middle * p, 1.0), w) < target_share:
            low = middle
        else:
            high = middle
    return np.minimum(prob * high, 1.0)


@dataclass(frozen=True)
class AgeBand:
    """Whole-year ages ``lower`` to ``upper``, both included.

    A fractional age belongs to the band of the whole years it has completed,
    so adjacent bands such as 16-24 and 25-34 leave no gap between them.
    """

    lower: int
    upper: int

    @property
    def label(self) -> str:
        return f"{self.lower}-{self.upper}"

    def contains(self, ages: np.ndarray) -> np.ndarray:
        ages = np.asarray(ages, dtype=float)
        return (ages >= self.lower) & (ages < self.upper + 1)


def working_age_bands(state_pension_age: int) -> list[AgeBand]:
    """The dashboard's working-age bands: 16-24, 25-34, 35-49 and 50 to SPA - 1."""
    if state_pension_age <= 50:
        raise ValueError(f"State pension age {state_pension_age} leaves no 50+ working-age band.")
    return [AgeBand(16, 24), AgeBand(25, 34), AgeBand(35, 49), AgeBand(50, state_pension_age - 1)]


def lfs_band_shares(
    ages: np.ndarray,
    joined: np.ndarray,
    weights: np.ndarray,
    bands: Sequence[AgeBand],
) -> dict[str, float]:
    """Survey-weighted share of panel members in each band who joined recently."""
    ages = np.asarray(ages, dtype=float)
    joined = np.asarray(joined, dtype=float)
    weights = np.asarray(weights, dtype=float)
    shares = {}
    for band in bands:
        in_band = band.contains(ages)
        if not in_band.any() or weights[in_band].sum() <= 0:
            raise ValueError(f"The LFS panel holds no weighted members aged {band.label}.")
        shares[band.label] = weighted_mean(joined[in_band], weights[in_band])
    return shares


def classifier_probabilities(donor: pd.DataFrame, receiver: pd.DataFrame) -> np.ndarray:
    """P(joined recently | age, gender, employment income) for every receiver row.

    microcosm-fit's CategoricalClassifier gives every receiver a probability,
    which the calibration can scale to the measured share.
    The fit takes the donor weights normalised to mean 1. The classifier's
    logit half normalises them that way itself, but its boosted half
    (scikit-learn's HistGradientBoostingClassifier) uses them as given: each
    leaf value divides a weighted gradient sum by a weighted hessian sum plus a
    fixed L2 penalty, so the penalty counts for less the larger the weights.
    Normalising makes the probabilities independent of the weights' scale.
    """
    from microcosm.fit import CategoricalClassifier

    weights = donor["weight"].to_numpy(dtype=float)
    if not (np.isfinite(weights).all() and (weights >= 0).all() and weights.sum() > 0):
        raise ValueError("Donor weights must be finite, non-negative and not all zero.")
    labels = donor[TARGET].astype(bool)
    if not (labels.to_numpy() & (weights > 0)).any():
        raise ValueError("No weighted LFS donor joined recently; nothing to impute.")
    model = CategoricalClassifier(categorical_predictors=("gender",), seed=CLASSIFIER_SEED).fit(
        donor.assign(**{TARGET: labels}), PREDICTORS, [TARGET], weights=weights / weights.mean()
    )
    return model.predict_proba(receiver[PREDICTORS])[:, model.classes_.tolist().index(True)]


def calibrate_by_band(
    prob: np.ndarray,
    ages: np.ndarray,
    eligible: np.ndarray,
    person_weights: np.ndarray,
    bands: Sequence[AgeBand],
    targets: dict[str, float],
) -> np.ndarray:
    """Calibrate each band's eligible people to that band's target; 0 for everyone else."""
    ages = np.asarray(ages, dtype=float)
    eligible = np.asarray(eligible, dtype=bool)
    out = np.zeros(len(ages))
    covered = np.zeros(len(ages), dtype=bool)
    for band in bands:
        in_band = band.contains(ages) & eligible
        if (in_band & covered).any():
            raise ValueError("Age bands overlap.")
        covered |= in_band
        out += calibrate(prob, in_band, person_weights, targets[band.label])
    return out


@dataclass
class RecentlyActiveImputation:
    """Calibrated probabilities and what set them."""

    probabilities: np.ndarray
    classifier_probabilities: np.ndarray
    band_targets: dict[str, float]
    band_shares_before_calibration: dict[str, float]


def impute_recently_active(
    donor: pd.DataFrame,
    receiver: pd.DataFrame,
    *,
    lfs_ages: np.ndarray,
    lfs_joined: np.ndarray,
    lfs_weights: np.ndarray,
    eligible: np.ndarray,
    person_weights: np.ndarray,
    bands: Sequence[AgeBand],
) -> RecentlyActiveImputation:
    """Fit on ``donor``, predict for ``receiver``, calibrate each band to the panel.

    Args:
        donor: Panel members with known pay: ``PREDICTORS``, ``TARGET`` and
            ``weight`` (the longitudinal weight).
        receiver: The PolicyEngine population's ``PREDICTORS``, one row per person.
        lfs_ages, lfs_joined, lfs_weights: Every weighted panel member, missing
            pay included; they set each band's target share.
        eligible: Receivers the reform covers (working age); everyone else gets 0.
        person_weights: The receivers' survey weights.
        bands: Disjoint age bands, each calibrated on its own.
    """
    raw = classifier_probabilities(donor, receiver)
    targets = lfs_band_shares(lfs_ages, lfs_joined, lfs_weights, bands)
    ages = receiver["age"].to_numpy(dtype=float)
    eligible = np.asarray(eligible, dtype=bool)
    before = {}
    for band in bands:
        in_band = band.contains(ages) & eligible
        before[band.label] = weighted_mean(raw[in_band], np.asarray(person_weights)[in_band])
    calibrated = calibrate_by_band(raw, ages, eligible, person_weights, bands, targets)
    return RecentlyActiveImputation(
        probabilities=calibrated,
        classifier_probabilities=raw,
        band_targets=targets,
        band_shares_before_calibration=before,
    )


def classifier_versions() -> dict[str, str | None]:
    """The packages behind the classifier, for the results JSON.

    Results published before the classifier recorded no microimpute version,
    which left the release behind them to inference. ``microcosm_fit_commit``
    comes from the install's PEP 610 record; it is None unless pip or uv
    installed microcosm-fit from git.
    """
    import importlib.metadata
    import json

    record = importlib.metadata.distribution("microcosm-fit").read_text("direct_url.json")
    commit = json.loads(record).get("vcs_info", {}).get("commit_id") if record else None
    return {
        "microcosm_fit": importlib.metadata.version("microcosm-fit"),
        "microcosm_fit_commit": commit,
        "scikit_learn": importlib.metadata.version("scikit-learn"),
    }
