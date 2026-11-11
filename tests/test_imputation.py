"""Properties of the recently-active imputation (``nics_exemption.imputation``).

``calibrate`` sets each band's level. For every input it accepts:

1. Every output lies in [0, 1], and people outside the treated mask get 0.
2. The weighted mean over treated people equals the target whenever the
   target is reachable (at most the weighted share of treated people with a
   nonzero probability); otherwise the function raises.
3. One factor: every treated output is ``min(f * p, 1)`` for the same ``f``.
4. Order: a higher input probability never gets a lower output.
5. Rescaling every weight by one constant leaves the output unchanged.
6. Calibrating an already-calibrated vector returns it.
7. A higher target never lowers anyone's output.
8. Differential: where no scaled probability reaches 1, the output equals the
   closed-form ratio ``p * target / mean(p)`` bit for bit.

The band helpers add:

9. ``calibrate_by_band`` puts each band's eligible people at that band's
   target and gives everyone else 0.
10. A band's outputs depend only on that band's inputs.
11. The working-age bands partition [16, SPA): every age in that range lies in
    exactly one band, and no other age lies in any.
12. ``lfs_band_shares`` is the survey-weighted share in each band, and
    rescaling every weight leaves it unchanged.

The classifier tests need microcosm-fit (the ``imputation`` extra) and skip
without it:

13. Probabilities lie in [0, 1] and take many values, not the two that the
    published class labels took.
14. Rescaling the donor weights by a power of two leaves the probabilities
    unchanged bit for bit: the fit normalises the weights to mean 1, and a
    power of two scales a float exactly.
15. Two fits on the same donors agree bit for bit (we seed the classifier).

Invariants 5-7 hold exactly in real arithmetic. In floats, when nearly all of
the target comes from people at the cap, the factor rests on the few below it,
and rounding can move a low-weight person's output by more than one ulp. So
those tests bound the weighted mean difference over treated people, the
quantity every published figure sums.

The generated probabilities and targets are 0, 1 or at least 1e-12, and the
weights 0 or at least 1e-6, so no product or weighted mean underflows; real
inputs sit far from that range. ``test_a_tiny_probability_does_not_stall_the_search``
covers an extreme bracket by hand.
"""

import numpy as np
import pandas as pd
import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from nics_exemption.imputation import (
    PREDICTORS,
    TARGET,
    AgeBand,
    calibrate,
    calibrate_by_band,
    impute_recently_active,
    lfs_band_shares,
    weighted_mean,
    working_age_bands,
)

SHARE_TOLERANCE = 1e-9
WEIGHTED_TOLERANCE = 1e-9


probabilities = st.one_of(st.sampled_from([0.0, 1.0]), st.floats(1e-12, 1))
shares = st.one_of(st.just(0.0), st.floats(1e-12, 1))
person_weights = st.one_of(st.just(0.0), st.floats(1e-6, 1e4))


@st.composite
def calibration_inputs(draw):
    n = draw(st.integers(1, 40))
    prob = np.array(draw(st.lists(probabilities, min_size=n, max_size=n)))
    weights = np.array(draw(st.lists(person_weights, min_size=n, max_size=n)))
    treated = np.array(draw(st.lists(st.booleans(), min_size=n, max_size=n)))
    assume(weights[treated].sum() > 0)
    assume((prob[treated] * weights[treated]).sum() > 0)
    target = draw(shares)
    return prob, treated, weights, target


def reachable_share(prob, treated, weights):
    w = weights[treated]
    return float((w * (prob[treated] > 0)).sum() / w.sum())


def weighted_share(values, treated, weights):
    w = weights[treated]
    return float((w * values[treated]).sum() / w.sum())


def weighted_gap(a, b, treated, weights):
    """Weighted mean of |a - b| over treated people."""
    w = weights[treated]
    return float((w * np.abs(a - b)[treated]).sum() / w.sum())


def ratio_formula(prob, treated, weights, target):
    """Scale treated probabilities by target / mean, with no cap."""
    prob = np.where(treated, prob, 0.0)
    return prob * (target / weighted_mean(prob[treated], weights[treated]))


def calibrate_or_none(prob, treated, weights, target):
    if target > reachable_share(prob, treated, weights) + 1e-12:
        with pytest.raises(ValueError, match="No scaling"):
            calibrate(prob, treated, weights, target)
        return None
    return calibrate(prob, treated, weights, target)


# ── calibrate ────────────────────────────────────────────────────────────────


@settings(max_examples=400, deadline=None)
@given(calibration_inputs())
def test_bounds_mask_and_target(inputs):
    prob, treated, weights, target = inputs
    out = calibrate_or_none(prob, treated, weights, target)
    if out is None:
        return
    assert ((out >= 0) & (out <= 1)).all()
    assert (out[~treated] == 0).all()
    assert abs(weighted_share(out, treated, weights) - target) <= SHARE_TOLERANCE


@settings(max_examples=400, deadline=None)
@given(calibration_inputs())
def test_one_factor_and_order(inputs):
    prob, treated, weights, target = inputs
    out = calibrate_or_none(prob, treated, weights, target)
    if out is None:
        return
    p, o = prob[treated], out[treated]
    assert (o[p == 0] == 0).all()
    below_one = (p > 0) & (o < 1)
    if below_one.any():
        factors = o[below_one] / p[below_one]
        assert np.allclose(factors, factors[0], rtol=1e-12, atol=0)
        # Anyone at 1 has a scaled probability of at least 1.
        assert (p[o >= 1] * factors[0] >= 1 - 1e-12).all()
    order = np.argsort(p, kind="stable")
    assert (np.diff(o[order]) >= -1e-15).all()


@settings(max_examples=300, deadline=None)
@given(calibration_inputs(), st.floats(1e-3, 1e3))
def test_weight_scale_invariance(inputs, scale):
    prob, treated, weights, target = inputs
    out = calibrate_or_none(prob, treated, weights, target)
    if out is None:
        return
    rescaled = calibrate(prob, treated, weights * scale, target)
    assert weighted_gap(rescaled, out, treated, weights) <= WEIGHTED_TOLERANCE


@settings(max_examples=300, deadline=None)
@given(calibration_inputs())
def test_idempotent(inputs):
    prob, treated, weights, target = inputs
    out = calibrate_or_none(prob, treated, weights, target)
    if out is None or weighted_share(out, treated, weights) <= 0:
        return
    again = calibrate(out, treated, weights, target)
    assert weighted_gap(again, out, treated, weights) <= WEIGHTED_TOLERANCE


@settings(max_examples=300, deadline=None)
@given(calibration_inputs(), shares)
def test_monotone_in_target(inputs, other_target):
    prob, treated, weights, target = inputs
    low, high = sorted([target, other_target])
    if high > reachable_share(prob, treated, weights):
        return
    out_low = calibrate(prob, treated, weights, low)
    out_high = calibrate(prob, treated, weights, high)
    shortfall = np.maximum(out_low - out_high, 0.0)
    assert weighted_gap(shortfall, np.zeros_like(shortfall), treated, weights) <= WEIGHTED_TOLERANCE


@settings(max_examples=400, deadline=None)
@given(calibration_inputs())
def test_matches_the_ratio_where_the_cap_never_binds(inputs):
    prob, treated, weights, target = inputs
    ratio = ratio_formula(prob, treated, weights, target)
    assume(ratio.max() <= 1)
    assert np.array_equal(calibrate(prob, treated, weights, target), ratio)


def test_labels_below_the_target_cannot_be_calibrated():
    """0/1 labels whose share sits below the target have nothing to scale up."""
    labels = np.array([1.0, 0.0, 0.0, 0.0, 0.0])
    treated = np.ones(5, dtype=bool)
    weights = np.ones(5)
    with pytest.raises(ValueError, match="No scaling"):
        calibrate(labels, treated, weights, 0.25)


def test_clipped_mass_moves_to_people_below_one():
    prob = np.array([0.9, 0.3, 0.1, 0.0])
    treated = np.ones(4, dtype=bool)
    weights = np.ones(4)
    out = calibrate(prob, treated, weights, 0.5)
    # Scaling by 0.5 / 0.325 would put the first person above 1; the factor
    # that puts the mean at 0.5 caps them at 1 and gives the rest 2.5x.
    assert out == pytest.approx([1.0, 0.75, 0.25, 0.0])
    assert out.mean() == pytest.approx(0.5)


def test_downward_calibration_matches_scaling():
    prob = np.array([0.8, 0.4, 0.2])
    treated = np.ones(3, dtype=bool)
    weights = np.array([1.0, 2.0, 1.0])
    out = calibrate(prob, treated, weights, 0.1)
    assert out == pytest.approx(prob * 0.1 / np.average(prob, weights=weights))


def test_a_zero_target_gives_zeros_even_when_every_probability_is_zero():
    """A band where the panel measures no one joining calibrates to all zeros."""
    treated = np.ones(3, dtype=bool)
    assert (calibrate(np.zeros(3), treated, np.ones(3), 0.0) == 0).all()
    assert (calibrate(np.array([0.2, 0.0, 0.7]), treated, np.ones(3), 0.0) == 0).all()


@pytest.mark.parametrize(
    ("prob", "weights", "target", "message"),
    [
        ([0.0, 0.0], [1.0, 1.0], 0.1, "zero across"),
        ([0.5, 1.5], [1.0, 1.0], 0.1, r"\[0, 1\]"),
        ([0.5, np.nan], [1.0, 1.0], 0.1, r"\[0, 1\]"),
        ([0.5, 0.5], [1.0, -1.0], 0.1, "weights"),
        ([0.5, 0.5], [0.0, 0.0], 0.1, "weights"),
        ([0.5, 0.5], [1.0, 1.0], 1.5, "target share"),
        ([0.5, 0.5], [1.0, 1.0], -0.1, "target share"),
    ],
)
def test_refuses_invalid_input(prob, weights, target, message):
    with pytest.raises(ValueError, match=message):
        calibrate(np.array(prob), np.ones(2, dtype=bool), np.array(weights), target)


def test_a_tiny_probability_does_not_stall_the_search():
    """The factor's bracket can span hundreds of orders of magnitude."""
    prob = np.array([0.9, 0.3, 1e-300, 0.0])
    treated = np.ones(4, dtype=bool)
    weights = np.ones(4)
    out = calibrate(prob, treated, weights, 0.5)
    assert out.mean() == pytest.approx(0.5, abs=1e-12)
    assert out[:2] == pytest.approx([1.0, 1.0])
    # The factor is 1 / 0.3, so the tiny probability scales by that and no more.
    assert out[2] / prob[2] == pytest.approx(1 / 0.3, rel=1e-9)


# ── Bands ────────────────────────────────────────────────────────────────────


@st.composite
def banded_inputs(draw):
    bands = working_age_bands(draw(st.integers(51, 70)))
    ages, prob, eligible = [], [], []
    for band in bands:
        # One eligible member with a positive probability, so every band calibrates.
        ages.append(draw(st.integers(band.lower, band.upper)))
        prob.append(draw(st.floats(1e-6, 1)))
        eligible.append(True)
    extra = draw(st.integers(0, 30))
    ages += draw(st.lists(st.integers(0, 90), min_size=extra, max_size=extra))
    prob += draw(st.lists(probabilities, min_size=extra, max_size=extra))
    eligible += draw(st.lists(st.booleans(), min_size=extra, max_size=extra))
    n = len(ages)
    weights = np.array(draw(st.lists(st.floats(1e-3, 1e4), min_size=n, max_size=n)))
    ages = np.array(ages, dtype=float)
    prob = np.array(prob)
    eligible = np.array(eligible)
    targets = {}
    for band in bands:
        in_band = band.contains(ages) & eligible
        targets[band.label] = draw(st.floats(0, 1)) * reachable_share(prob, in_band, weights)
    return prob, ages, eligible, weights, bands, targets


@settings(max_examples=300, deadline=None)
@given(banded_inputs())
def test_each_band_hits_its_target_and_everyone_else_gets_zero(inputs):
    prob, ages, eligible, weights, bands, targets = inputs
    out = calibrate_by_band(prob, ages, eligible, weights, bands, targets)
    assert ((out >= 0) & (out <= 1)).all()
    covered = np.zeros(len(ages), dtype=bool)
    for band in bands:
        in_band = band.contains(ages) & eligible
        covered |= in_band
        assert abs(weighted_share(out, in_band, weights) - targets[band.label]) <= SHARE_TOLERANCE
    assert (out[~covered] == 0).all()


@settings(max_examples=200, deadline=None)
@given(banded_inputs(), st.integers(0, 3))
def test_a_band_depends_only_on_its_own_inputs(inputs, which):
    prob, ages, eligible, weights, bands, targets = inputs
    band = bands[which]
    in_band = band.contains(ages) & eligible
    # Halve everyone else's probabilities: zeros stay zero, so every other
    # band's target stays reachable.
    changed = np.where(in_band, prob, prob / 2)
    before = calibrate_by_band(prob, ages, eligible, weights, bands, targets)
    after = calibrate_by_band(changed, ages, eligible, weights, bands, targets)
    assert np.array_equal(before[in_band], after[in_band])


@settings(max_examples=200, deadline=None)
@given(st.integers(51, 90), st.lists(st.floats(0, 100, exclude_max=True), max_size=50))
def test_working_age_bands_partition_sixteen_to_pension_age(spa, ages):
    bands = working_age_bands(spa)
    ages = np.array(ages + [15.999, 16.0, 24.5, spa - 0.001, float(spa)])
    hits = sum(band.contains(ages).astype(int) for band in bands)
    assert (hits == ((ages >= 16) & (ages < spa))).all()


def test_working_age_bands_need_a_fifty_plus_band():
    with pytest.raises(ValueError, match="50\\+"):
        working_age_bands(50)
    assert [b.label for b in working_age_bands(66)] == ["16-24", "25-34", "35-49", "50-65"]


@settings(max_examples=200, deadline=None)
@given(banded_inputs(), st.floats(1e-3, 1e3))
def test_lfs_band_shares_are_weighted_shares(inputs, scale):
    _, ages, eligible, weights, bands, _ = inputs
    joined = eligible  # any boolean column will do
    shares = lfs_band_shares(ages, joined, weights, bands)
    rescaled = lfs_band_shares(ages, joined, weights * scale, bands)
    for band in bands:
        in_band = band.contains(ages)
        expected = (weights[in_band] * joined[in_band]).sum() / weights[in_band].sum()
        assert shares[band.label] == pytest.approx(expected, rel=1e-12, abs=1e-15)
        assert rescaled[band.label] == pytest.approx(shares[band.label], rel=1e-12, abs=1e-15)


def test_lfs_band_shares_refuse_an_empty_band():
    with pytest.raises(ValueError, match="no weighted members aged 25-34"):
        lfs_band_shares(np.array([20.0]), np.array([True]), np.ones(1), working_age_bands(66))


def test_overlapping_bands_are_refused():
    prob = np.full(3, 0.5)
    ages = np.array([20.0, 27.0, 35.0])
    bands = [AgeBand(16, 30), AgeBand(25, 40)]
    with pytest.raises(ValueError, match="overlap"):
        calibrate_by_band(
            prob, ages, np.ones(3, dtype=bool), np.ones(3), bands, {"16-30": 0.1, "25-40": 0.1}
        )


# ── Classifier (needs microcosm-fit) ─────────────────────────────────────────


def synthetic_donors(n=3000, seed=0):
    """LFS-like donors: joining is common among the young and rare later on.

    Employment income is 0 for about a third of donors, as for LFS members not
    employed at wave 5.
    """
    rng = np.random.default_rng(seed)
    age = rng.integers(16, 71, n).astype(float)
    gender = rng.choice(["MALE", "FEMALE"], n)
    income = np.where(rng.random(n) < 0.35, 0.0, rng.lognormal(10, 0.6, n))
    rate = np.where(age < 25, 0.15, np.where(age < 50, 0.05, 0.02))
    joined = rng.random(n) < rate
    weight = rng.uniform(200, 2000, n)
    return pd.DataFrame(
        {
            "age": age,
            "gender": gender,
            "employment_income": income,
            TARGET: joined,
            "weight": weight,
        }
    )


def synthetic_receivers(n=2000, seed=1):
    rng = np.random.default_rng(seed)
    return pd.DataFrame(
        {
            "age": rng.integers(0, 81, n).astype(float),
            "gender": rng.choice(["MALE", "FEMALE"], n),
            "employment_income": np.where(rng.random(n) < 0.4, 0.0, rng.lognormal(10, 0.6, n)),
        }
    )


@pytest.fixture(scope="module")
def classifier_probabilities():
    pytest.importorskip("microcosm.fit")
    from nics_exemption.imputation import classifier_probabilities

    return classifier_probabilities


def test_classifier_gives_probabilities_not_labels(classifier_probabilities):
    donors, receivers = synthetic_donors(), synthetic_receivers()
    p = classifier_probabilities(donors, receivers)
    assert p.shape == (len(receivers),)
    assert ((p >= 0) & (p <= 1)).all()
    assert len(np.unique(p)) > 100
    # It learns the age gradient the donors carry.
    young = (receivers.age >= 16) & (receivers.age < 25)
    older = (receivers.age >= 50) & (receivers.age < 66)
    assert p[young.to_numpy()].mean() > 2 * p[older.to_numpy()].mean()


@pytest.mark.parametrize("scale", [0.25, 4.0])
def test_classifier_ignores_the_weights_scale(classifier_probabilities, scale):
    donors, receivers = synthetic_donors(), synthetic_receivers()
    base = classifier_probabilities(donors, receivers)
    rescaled = classifier_probabilities(donors.assign(weight=donors.weight * scale), receivers)
    assert np.array_equal(base, rescaled)


def test_classifier_is_deterministic(classifier_probabilities):
    donors, receivers = synthetic_donors(), synthetic_receivers()
    assert np.array_equal(
        classifier_probabilities(donors, receivers), classifier_probabilities(donors, receivers)
    )


def test_classifier_refuses_donors_with_no_one_joining(classifier_probabilities):
    donors = synthetic_donors().assign(**{TARGET: False})
    with pytest.raises(ValueError, match="joined recently"):
        classifier_probabilities(donors, synthetic_receivers())


@pytest.mark.parametrize("bad", [-1.0, np.nan, np.inf])
def test_classifier_refuses_bad_weights(classifier_probabilities, bad):
    donors = synthetic_donors()
    donors.loc[0, "weight"] = bad
    with pytest.raises(ValueError, match="Donor weights"):
        classifier_probabilities(donors, synthetic_receivers())


def test_imputation_end_to_end(classifier_probabilities):
    donors, receivers = synthetic_donors(), synthetic_receivers()
    lfs = synthetic_donors(n=4000, seed=2)  # every panel member, missing pay included
    rng = np.random.default_rng(3)
    person_weights = rng.uniform(500, 5000, len(receivers))
    eligible = ((receivers.age >= 16) & (receivers.age < 66)).to_numpy()
    bands = working_age_bands(66)
    result = impute_recently_active(
        donors,
        receivers[PREDICTORS],
        lfs_ages=lfs.age.to_numpy(),
        lfs_joined=lfs[TARGET].to_numpy(),
        lfs_weights=lfs.weight.to_numpy(),
        eligible=eligible,
        person_weights=person_weights,
        bands=bands,
    )
    p = result.probabilities
    assert ((p >= 0) & (p <= 1)).all()
    assert (p[~eligible] == 0).all()
    assert len(np.unique(p[eligible])) > 100
    targets = lfs_band_shares(lfs.age, lfs[TARGET], lfs.weight, bands)
    assert result.band_targets == targets
    for band in bands:
        in_band = band.contains(receivers.age) & eligible
        assert weighted_mean(p[in_band], person_weights[in_band]) == pytest.approx(
            targets[band.label], abs=SHARE_TOLERANCE
        )
        assert result.band_shares_before_calibration[band.label] == pytest.approx(
            weighted_mean(result.classifier_probabilities[in_band], person_weights[in_band])
        )
