# NICs Exemption for Recently-Inactive Employees

Interactive dashboard estimating the cost, employment effects, and poverty impact of exempting employers from National Insurance contributions on all employees who recently transitioned from economic inactivity into work (disabled and non-disabled), using [PolicyEngine UK](https://github.com/PolicyEngine/policyengine-uk) microsimulation.

**Live dashboard:** [nics-exemption-inactive-employees.vercel.app](https://nics-exemption-inactive-employees.vercel.app)

## What the dashboard covers

- **Static cost**: foregone employer NICs on ~3M recently-active workers (£3.5bn/year)
- **Behavioural response**: labour supply estimates using a single population-wide extensive-margin participation elasticity of 0.25 from [Chetty, Guren, Manoli & Weber (2013)](https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf), with low (0.1) / high (0.4) scenarios bracketing the wider literature range
- **Poverty impact**: people lifted out of poverty (BHC) via higher wages and new employment
- **Counterfactual**: comparison with disability benefit cuts (10% PIP/DLA reduction)
- **Breakdowns**: by age, gender, country, household type, income decile, and wealth decile

## Quick start

### Python pipeline

```bash
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -e ".[simulation,dev]"

# Hugging Face token with read access to
# `policyengine/policyengine-uk-data-private` is required — the pipeline
# fetches the latest enhanced-FRS microdata directly from there at runtime.
# There is no local fallback.
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

The Hugging Face dataset URL the pipeline pulls from is hard-coded as
`hf://policyengine/policyengine-uk-data-private/enhanced_frs_2023_24.h5`
(latest, no version pin). To pin a specific data release for
reproducibility, edit `DATASET_URL` in `src/nics_exemption/pipeline.py`
and append `@<version>`.

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
