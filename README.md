# NICs Exemption for Recently-Inactive Employees

Interactive dashboard estimating the cost, employment effects, and poverty impact of exempting employers from National Insurance contributions on all employees who recently transitioned from economic inactivity into work (disabled and non-disabled), using [PolicyEngine UK](https://github.com/PolicyEngine/policyengine-uk) microsimulation.

**Live dashboard:** [nics-exemption-inactive-employees.vercel.app](https://nics-exemption-inactive-employees.vercel.app)

## What the dashboard covers

- **Static cost**: foregone employer NICs on ~3M recently-active workers (£3.5bn/year)
- **Behavioural response**: labour supply estimates using participation elasticities (0.1 / 0.25 / 0.4) from [Meghir & Phillips (2010)](https://ifs.org.uk/publications/labour-supply-and-taxes)
- **Poverty impact**: people lifted out of poverty (BHC) via higher wages and new employment
- **Counterfactual**: comparison with disability benefit cuts (10% PIP/DLA reduction)
- **Breakdowns**: by age, gender, country, household type, income decile, and wealth decile

## Quick start

### Python pipeline

```bash
conda activate python313
python run_pipeline.py
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

## Architecture

```
nics-exemption-inactive-employees/
├── run_pipeline.py         # Main pipeline script
├── data/                   # Generated JSON output
└── dashboard/              # Next.js dashboard
```

## Data sources

- [PolicyEngine UK](https://policyengine.org) microsimulation (Enhanced FRS 2023-24)
- [ONS Labour Force Survey](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance) (5-quarter longitudinal) for inactivity transitions
- [microimpute](https://github.com/PolicyEngine/microimpute) library for statistical imputation (LFS → FRS)
- [Meghir & Phillips (2010)](https://ifs.org.uk/publications/labour-supply-and-taxes) for participation elasticities
- [Gruber (2000)](https://doi.org/10.1086/319564) and [Marie & Vall Castelló (2012)](https://doi.org/10.1016/j.jpubeco.2012.01.006) for income-effect elasticity
