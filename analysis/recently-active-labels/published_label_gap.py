"""How far the published recently-active figures rest on 0/1 class labels.

Reads only ``data/nics_exemption_results.json``, the published results, and
compares two shares the file publishes side by side:

- ``pct_active_by_age``: the share of Enhanced FRS people at each single age
  whose imputed status is 1. microimpute wrote a 0/1 class label for each
  person, so this is the share labelled 1.
- ``pct_active_by_age_lfs``: the share measured directly in the LFS panel at
  each single age, survey-weighted.

The results publish population only by age band (``baseline.by_age``), so the
script spreads each band's population over its single ages in two ways:

- ``even``: every age in the band holds the same population.
- ``tilted``: the even split tilted (exponentially in each age's labelled
  share) just enough to reproduce the band's published labelled count. Of all
  splits consistent with that count, it stays closest to even.

Each band's LFS share, times the band's population, gives the count a
calibration to the LFS would publish. The static cost under a different count
depends on which employees carry it, so the script reports scenarios, not
bounds:

- ``same_mix``: each band keeps its published average employer NICs per
  recently-active person.
- ``band_average_nics``: the recently-active people in each band carry the
  band's average employer NICs per person, as a random draw from the band
  would.

    python analysis/recently-active-labels/published_label_gap.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "data" / "nics_exemption_results.json"
OUTPUT = Path(__file__).with_name("published_label_gap_output.json")


def band_ages(label: str) -> list[int]:
    lower, upper = label.split("-")
    return list(range(int(lower), int(upper) + 1))


def weighted_share(shares: dict[int, float], weights: dict[int, float]) -> float:
    return sum(weights[a] * shares[a] for a in weights) / sum(weights.values())


def even_weights(ages: list[int]) -> dict[int, float]:
    return dict.fromkeys(ages, 1.0)


def tilted_weights(ages: list[int], labelled: dict[int, float], target: float) -> dict[int, float]:
    """Weights proportional to exp(lam * labelled share), with lam set to hit the target.

    The weighted labelled share rises continuously in lam, from the band's
    lowest single-age share to its highest, so bisection finds lam.
    """
    shares = [labelled[a] for a in ages]
    if not min(shares) < target < max(shares):
        raise ValueError("The published band share lies outside its single-age shares.")
    low, high = -1e4, 1e4
    for _ in range(200):
        lam = (low + high) / 2
        top = max(lam * s for s in shares)
        weights = {a: math.exp(lam * labelled[a] - top) for a in ages}
        if weighted_share(labelled, weights) < target:
            low = lam
        else:
            high = lam
    top = max(high * s for s in shares)
    return {a: math.exp(high * labelled[a] - top) for a in ages}


def summarise(results: dict) -> dict:
    labelled = {int(k): v for k, v in results["pct_active_by_age"].items()}
    lfs = {int(k): v for k, v in results["pct_active_by_age_lfs"].items()}
    bands = [b for b in results["baseline"]["by_age"] if not b["age_group"].endswith("+")]
    pension_age = [b for b in results["baseline"]["by_age"] if b["age_group"].endswith("+")]

    rows = []
    for band in bands:
        ages = band_ages(band["age_group"])
        published_share = band["n_recently_active"] / band["n_total"]
        splits = {
            "even": even_weights(ages),
            "tilted": tilted_weights(ages, labelled, published_share),
        }
        row = {
            "age_group": band["age_group"],
            "population": band["n_total"],
            "published_count": band["n_recently_active"],
            "published_share": published_share,
            "published_cost_bn": band["nics_exemption_cost_bn"],
            "band_employer_nics_bn": band["employer_nics_bn"],
            "labelled_share_even_split": weighted_share(labelled, splits["even"]),
            "lfs_share": {},
            "lfs_level_count": {},
            "count_vs_published": {},
            "cost_bn": {},
        }
        for name, weights in splits.items():
            share = weighted_share(lfs, weights)
            count = share * band["n_total"]
            row["lfs_share"][name] = share
            row["lfs_level_count"][name] = count
            row["count_vs_published"][name] = count / band["n_recently_active"] - 1
            row["cost_bn"][name] = {
                "same_mix": band["nics_exemption_cost_bn"] * count / band["n_recently_active"],
                "band_average_nics": share * band["employer_nics_bn"],
            }
        rows.append(row)

    population = sum(r["population"] for r in rows)
    published_count = sum(r["published_count"] for r in rows)
    published_cost = results["nics_exemption"]["nics_recently_active_bn"]
    totals = {
        "working_age_population": population,
        "published_count": published_count,
        "published_share": published_count / population,
        "published_cost_bn": published_cost,
        "published_cost_bn_sum_of_rounded_bands": sum(r["published_cost_bn"] for r in rows),
        "lfs_level": {},
    }
    for name in ("even", "tilted"):
        count = sum(r["lfs_level_count"][name] for r in rows)
        totals["lfs_level"][name] = {
            "count": count,
            "share": count / population,
            "count_vs_published": count / published_count - 1,
            "cost_bn_same_mix_by_band": sum(r["cost_bn"][name]["same_mix"] for r in rows),
            "cost_bn_band_average_nics": sum(r["cost_bn"][name]["band_average_nics"] for r in rows),
            "cost_bn_same_mix_overall": published_cost * count / published_count,
            # Bands whose LFS-level count exceeds the published count.
            "bands_above_published": [
                r["age_group"] for r in rows if r["lfs_level_count"][name] > r["published_count"]
            ],
        }

    oldest_lfs_age = max(lfs)
    pension_age_start = int(pension_age[0]["age_group"].rstrip("+"))
    beyond = {a: s for a, s in labelled.items() if a > oldest_lfs_age}
    pension = {
        "age_groups": [b["age_group"] for b in pension_age],
        "published_count": sum(b["n_recently_active"] for b in pension_age),
        "population": sum(b["n_total"] for b in pension_age),
        "cost_bn": sum(b["nics_exemption_cost_bn"] for b in pension_age),
        "oldest_lfs_age": oldest_lfs_age,
        "lfs_share_by_age_above_spa": {a: s for a, s in lfs.items() if a >= pension_age_start},
        "labelled_share_by_age_beyond_lfs": beyond,
        "labelled_share_range_beyond_lfs": [min(beyond.values()), max(beyond.values())],
        "count_including_pension_age": published_count
        + sum(b["n_recently_active"] for b in pension_age),
    }
    return {"bands": rows, "working_age": totals, "pension_age": pension}


def main() -> None:
    summary = summarise(json.loads(RESULTS.read_text()))
    text = json.dumps(summary, indent=2)
    OUTPUT.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
