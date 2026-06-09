# NICs Exemption for Recently-Inactive Employees

Interactive dashboard estimating the cost, employment effects, and poverty impact of exempting employers from National Insurance contributions on all employees who recently transitioned from economic inactivity into work (disabled and non-disabled), using [PolicyEngine UK](https://github.com/PolicyEngine/policyengine-uk) microsimulation.

**Live dashboard:** [nics-exemption-inactive-employees.vercel.app](https://nics-exemption-inactive-employees.vercel.app)

## What the dashboard covers

- **Static cost**: foregone employer NICs on ~1.7M recently-active workers (~£5.1bn/year)
- **Household calculator**: the exact net-income effect of the exemption (under full pass-through) for a chosen household profile across salaries, computed directly in PolicyEngine UK
- **Behavioural response**: labour supply estimates using a single population-wide extensive-margin participation elasticity of 0.25 from [Chetty, Guren, Manoli & Weber (2013)](https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf), with low (0.1) / high (0.4) scenarios bracketing the wider literature range
- **Poverty impact**: people lifted out of poverty (BHC) via higher wages and new employment
- **Counterfactual**: comparison with disability benefit cuts (a uniform PIP/DLA reduction back-solved to the £4.8bn Spring Statement 2025 saving — ~17.5%)
- **Breakdowns**: by age, gender, country, and household type, with behavioural new-entrant breakdowns by age and income decile

## Quick start

### Python pipeline

```bash
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -e ".[simulation,dev]"

# The pipeline loads the baseline through the unified `policyengine`
# (`policyengine.py`) bundle via `managed_microsimulation()`, which resolves
# the enhanced-FRS microdata version from the installed release manifest. If
# that dataset is private, set a Hugging Face token with the required read
# access before running. There is no local fallback.
export HUGGING_FACE_TOKEN=hf_your_actual_token_here

# Run via the package entry point (preferred)…
python -m nics_exemption \
  --year 2026 \
  --lfs-path /path/to/lfs.tab \
  --effective-marginal-rate 0.4 \
  --elasticity-low 0.1 \
  --elasticity-central 0.25 \
  --elasticity-high 0.4 \
  --benefit-cut-target-bn 4.8 \
  --benefit-cut-elasticity 0.22

# …or the back-compat shim:
# python run_pipeline.py …same args…
# …or after `pip install -e .`, the console script:
# nics-exemption-build …same args…
```

The dataset is not hard-coded: `managed_microsimulation()` pins it to the
selection in the installed `policyengine` (`policyengine.py`) release bundle,
so the enhanced-FRS microdata version tracks whatever that bundle certifies.
To change the data release, install the corresponding `policyengine` version.

### Dashboard

```bash
cd dashboard
bun install
bun run dev
```

### Tests

```bash
.venv/bin/pytest tests/ -v
```

## Architecture

```
nics-exemption-inactive-employees/
├── run_pipeline.py         # Main pipeline script
├── src/nics_exemption/     # LFS preparation helpers
├── tests/                  # Unit tests
├── data/                   # Generated JSON output
└── dashboard/              # Next.js dashboard (Bun)
```

## Data sources

- [PolicyEngine UK](https://policyengine.org) microsimulation (Enhanced FRS 2023-24)
- [ONS Labour Force Survey](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance) (5-quarter longitudinal) for inactivity transitions
- [microimpute](https://github.com/PolicyEngine/microimpute) library for statistical imputation (LFS → FRS)
- [Chetty, Guren, Manoli & Weber (2013)](https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf) — *NBER Macroeconomics Annual* 27 — for the central extensive-margin participation elasticity (0.25, the canonical meta-analysis value)
- [Marie & Vall Castelló (2012)](https://eprints.lse.ac.uk/40085/) for the 0.22 DI-generosity elasticity used in the benefit-cut counterfactual
- [Gruber (2000)](https://doi.org/10.1086/319564) and [Marie & Vall Castelló (2012)](https://eprints.lse.ac.uk/40085/) for income-effect elasticity

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
