"""Per-person net-income lookup for the dashboard's "Try it" calculator.

The dashboard calculator lets a reader pick a single worker's household
profile and salary and see how the NICs exemption (passed through as higher
gross pay under full pass-through) changes their net income. Rather than the
flat effective-marginal-rate assumption the population model uses, this builds
an exact PolicyEngine UK household-net-income curve for each profile, so the
real tax-and-benefit interactions (income tax, employee NICs, the Universal
Credit taper, etc.) are reflected.

The lookup is built from synthetic households — it needs no microdata — so it
can be regenerated independently of the main microsimulation run.
"""

from __future__ import annotations

from itertools import product

# England, Wales and Northern Ireland share income-tax rates; only Scotland
# differs, so we compute two tax regions and the dashboard maps the four
# countries onto them. A representative region is used for each.
REGION_BY_GROUP = {"ruk": "SOUTH_EAST", "scotland": "SCOTLAND"}

# Fixed household assumptions, surfaced to the dashboard so they can be shown.
WORKING_AGE = 35
OVER_SPA_AGE = 70
PARTNER_AGE = 38
CHILD_AGE = 5
RENTER_ANNUAL_RENT = 9000
CHILDREN_OPTIONS = (0, 1, 2)

# Gross-salary grid the net-income curve is sampled on (£5,000 steps). The grid
# runs past SALARY_MAX so the dashboard can interpolate net income at
# (salary + employer-NICs saving) — which sits above the salary itself — without
# clamping at the top of the range. The dashboard only *shows* salaries up to
# SALARY_MAX.
GRID_MIN = 4000
GRID_MAX = 116000
GRID_COUNT = 57  # £2,000 steps: 4000, 6000, …, 116000
SALARY_MAX = 100000


def profile_key(region_group, over_spa, couple, children, renter, disabled):
    """Stable key shared by the generator and the dashboard selectors."""
    return (
        f"{region_group}|spa{int(over_spa)}|cpl{int(couple)}"
        f"|ch{children}|rent{int(renter)}|dis{int(disabled)}"
    )


def _situation_parts(year, region_group, over_spa, couple, children, renter, disabled):
    """Build the people / benunit members / household dicts for a profile."""
    people = {"adult": {"age": {year: OVER_SPA_AGE if over_spa else WORKING_AGE}}}
    if disabled:
        people["adult"]["is_disabled_for_benefits"] = {year: True}
    members = ["adult"]
    if couple:
        people["partner"] = {"age": {year: PARTNER_AGE}}
        members.append("partner")
    for i in range(children):
        people[f"child{i}"] = {"age": {year: CHILD_AGE}}
        members.append(f"child{i}")

    household = {"members": members, "region": {year: REGION_BY_GROUP[region_group]}}
    if renter:
        household["tenure_type"] = {year: "RENT_PRIVATELY"}
        household["rent"] = {year: RENTER_ANNUAL_RENT}
    return people, members, household


def _components(sim, year):
    """Household net income, total benefits, income tax and employee NICs."""
    hh = sim.populations["household"]
    return (
        list(map(float, sim.calculate("household_net_income", year))),
        list(map(float, sim.calculate("household_benefits", year))),
        list(map(float, hh.sum(sim.calculate("income_tax", year)))),
        list(map(float, hh.sum(sim.calculate("national_insurance", year)))),
    )


def gross_grid():
    """Uniform £2,000 salary grid the curves are sampled on."""
    return [
        round(GRID_MIN + (GRID_MAX - GRID_MIN) * i / (GRID_COUNT - 1))
        for i in range(GRID_COUNT)
    ]


def _profile_curves(args):
    """Household net income and its components across the salary grid.

    Returns ``(key, curves)`` where ``curves`` holds four equal-length arrays —
    ``net`` (household net income), ``benefits`` (total household benefits),
    ``income_tax`` and ``employee_ni`` (household totals). The dashboard takes
    differences of these between a salary and that salary plus the employer-NICs
    saving to decompose where the pass-through goes (kept vs clawed back by tax,
    employee NICs and benefit withdrawal).

    All grid points are computed in one fast parametric (``axes``) sweep per
    profile. Note: PolicyEngine's Universal Credit calculation can be off on
    some rows of a vectorised sweep, so benefit-heavy profiles may show isolated
    artefacts. This is the top-level worker for the process pool, so ``args`` is
    a plain tuple."""
    from policyengine_uk import Simulation

    year, region_group, over_spa, couple, children, renter, disabled = args
    people, members, household = _situation_parts(
        year, region_group, over_spa, couple, children, renter, disabled
    )
    sim = Simulation(
        situation={
            "people": people,
            "benunits": {"bu": {"members": members}},
            "households": {"hh": household},
            "axes": [
                [
                    {
                        "name": "employment_income",
                        "count": GRID_COUNT,
                        "min": GRID_MIN,
                        "max": GRID_MAX,
                        "period": year,
                    }
                ]
            ],
        }
    )
    net, benefits, income_tax, employee_ni = _components(sim, year)
    key = profile_key(region_group, over_spa, couple, children, renter, disabled)
    return key, {
        "net": [round(x) for x in net],
        "benefits": [round(x) for x in benefits],
        "income_tax": [round(x) for x in income_tax],
        "employee_ni": [round(x) for x in employee_ni],
    }


def build_person_calculator_lookup(year, employer_rate, secondary_threshold_annual):
    """Build the full profile → net-income-curve lookup for the dashboard.

    Returns a JSON-serialisable dict the dashboard reads to compute, for any
    chosen profile and salary, the employer NICs saved and the resulting net
    income gain under full pass-through.
    """
    grid = gross_grid()

    combos = product(
        REGION_BY_GROUP, (False, True), (False, True), CHILDREN_OPTIONS, (False, True), (False, True)
    )
    args = [(year,) + combo for combo in combos]

    # One fast parametric sweep per profile — run sequentially (single core).
    profiles = {}
    for a in args:
        key, curves = _profile_curves(a)
        profiles[key] = curves

    return {
        "year": year,
        "employer_rate": employer_rate,
        "secondary_threshold_annual": secondary_threshold_annual,
        "gross_grid": grid,
        "salary_max": SALARY_MAX,
        # Each profile holds four equal-length component curves over gross_grid:
        # net household income, total benefits, household income tax and
        # household employee NICs. The dashboard differences these across the
        # pass-through to decompose the gross saving into kept vs clawed-back.
        "components": ["net", "benefits", "income_tax", "employee_ni"],
        "assumptions": {
            "working_age": WORKING_AGE,
            "over_spa_age": OVER_SPA_AGE,
            "partner_age": PARTNER_AGE,
            "child_age": CHILD_AGE,
            "renter_annual_rent": RENTER_ANNUAL_RENT,
            "children_options": list(CHILDREN_OPTIONS),
        },
        "profiles": profiles,
    }
