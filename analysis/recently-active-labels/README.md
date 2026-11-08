# Recently-active status: class labels in the published results

For the static cost, the pipeline adds up the employer NICs on working-age
employees who moved from economic inactivity into work within the LFS
five-quarter window (`joined_labour_force_recently`). It carries that status
from the LFS panel onto the Enhanced FRS and treats it as each person's
probability of having joined recently. In the June 2026 results (commit
`71add6e`), the imputation gave each person a class label of 0 or 1 instead.
The scripts here measure the labels' effect on the published results, and
`src/nics_exemption/imputation.py` replaces the labels with calibrated
probabilities.

## Findings

1. The imputation wrote a 0 or a 1 for every person, and the pipeline used
   that label as a probability without calibrating it.
2. If each working-age band matched the share the LFS measures, we estimate
   the working-age count would fall from 1,765,640 to between 1.59 million and
   1.65 million, 6.5% to 9.8% lower. The bands would move further: the 16-24
   count would roughly double, and each band from 25 to 65 would shrink by 25%
   to 38%.
3. Under the same calibration, we estimate a static cost between £4.30bn and
   £4.72bn, against the published £4.78bn. The figure depends on which
   employees carry the status, and the rerun will set it.
4. The repository README's "~2.8M recently-active workers" includes 1,012,805
   people aged 66 and over. The classifier labelled 8.4% of that group, while
   the LFS measures 0.5% to 2.3% at ages 66 to 70 and holds no one older. The
   dashboard's metric card counts working ages only and shows 1.8m. Its reform
   table lists the 66+ row, with a caption saying pension-age groups
   "contribute effectively nothing to the exemption cost". The pipeline keeps
   that row in the reform results because its filter still looks for a "65+"
   row to drop. Since April 2026 (`cba814d`), the pipeline has read state
   pension age from PolicyEngine UK and labels the row "66+".

## How the labels arose

At `71add6e`, Steps 4 and 5 of the pipeline cast `joined_labour_force_recently`
to float and pass it to microimpute's
`autoimpute(..., predictors=["age", "gender", "employment_income"], weight_col="weight", models=[QRF])`.
They clip the result to [0, 1], set it to 0 under age 16, and use it as
`recent_prob`.

The pipeline recorded no microimpute version in the results, and the project
required only `microimpute>=0.1.0` (`pyproject.toml`). Anyone installing it
fresh would have got 1.15.1 when the study began on 2026-04-01, and 3.1.1 on
the day of the June run. Both send the float 0/1 target to a classifier:

- In 1.15.1, `VariableTypeDetector.is_boolean_variable`
  (`utils/type_handling.py`) treats a float column holding only 0.0 and 1.0 as
  boolean, and `QRF` (`models/qrf.py`) fits a `RandomForestClassifier` for it.
- In 3.1.1, `is_boolean_variable` no longer accepts float columns, but
  `is_numeric_categorical_variable` accepts this one, and `QRF` fits the same
  classifier.

In both, `QRF` calls `predict` on its classifier wrapper
(`_RandomForestClassifierModel`) with `return_probs=False`. That call returns
the predicted class, and `autoimpute` writes it into `receiver_data`.
`release_sweep.py` runs the published call on synthetic data under each of the
nine releases PyPI lists from 1.15.1 to 3.1.1, and each returns only 0.0 and
1.0. We size the gap from the published JSON alone, so the sizing holds
whichever release ran.

Besides the static cost, the pipeline uses the labels for the average employer
NICs per recently-active worker and the static poverty count. It also uses
them for the breakdowns by age, gender, country and family type, the static
breakdowns by income and wealth decile, and the by-age chart. In Steps 9 and
10, it computes the behavioural estimates, their decile tables and the
benefit-cut counterfactual without them.

## Sizing from the published JSON

`published_label_gap.py` reads only `data/nics_exemption_results.json`. At
each single age, the pipeline wrote into that file the share of Enhanced FRS
people it labelled 1 (`pct_active_by_age`) and the survey-weighted share the
LFS panel measures (`pct_active_by_age_lfs`). It published population only by
band, so the script spreads each band's population over its ages in two ways:
evenly, and by tilting the even split until it reproduces the band's
published labelled count. The script then multiplies each band's LFS share by
the band's population to get the count that a calibration to the LFS would
publish. The fix pools each band's panel members by their own weights, so its band targets
match these shares when the panel and the Enhanced FRS spread each band's
population across ages alike.

| Band | Population | Published count (share) | LFS share, even / tilted | LFS-level count, even / tilted | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16-24 | 6,447,871 | 345,477 (5.36%) | 10.11% / 10.68% | 652,095 / 688,734 | +89% / +99% |
| 25-34 | 11,618,098 | 688,033 (5.92%) | 3.84% / 3.97% | 446,251 / 460,845 | −35% / −33% |
| 35-49 | 12,818,504 | 422,570 (3.30%) | 2.04% / 2.09% | 261,754 / 268,536 | −38% / −36% |
| 50-65 | 15,360,531 | 309,560 (2.02%) | 1.51% / 1.52% | 232,520 / 232,979 | −25% / −25% |
| **16-65** | **46,245,004** | **1,765,640 (3.82%)** | **3.44% / 3.57%** | **1,592,620 / 1,651,094** | **−9.8% / −6.5%** |

How far the static cost moves with the count depends on which employees carry
the status. The script prices three cases, in £bn:

| Case | Even | Tilted |
| --- | ---: | ---: |
| Each band keeps its published NICs per recently-active person | 4.30 | 4.46 |
| Each band's recently-active people carry the band's average employer NICs per person | 4.57 | 4.72 |
| The working-age NICs per recently-active person keeps its published level | 4.31 | 4.47 |
| Published | 4.78 | 4.78 |

The pension-age row holds 12,021,635 people, and the classifier labelled
1,012,805 of them (8.4%). The LFS measures 1.89%, 1.36%, 0.93%, 2.29% and
0.50% at ages 66 to 70. From 71 to 80, where the panel holds no one, the
labelled shares run from 1.65% to 38.3%. The pipeline counts only working ages
in the static cost, so the row adds nothing to it. The row's published
employer NICs round to £0.0bn, because PolicyEngine UK then charged no
employer NICs at or above state pension age. Under section 6(3) of the Social
Security Contributions and Benefits Act 1992, employees stop paying primary
contributions at pensionable age, but their employers keep paying secondary
contributions. PolicyEngine UK now charges those (policyengine-uk#1894).
Together, the 1,765,640 working-age and 1,012,805 pension-age people make
2,778,445, the README's "~2.8M".

## Run history

`published_runs.py` reads every committed version of the results and keeps
the five whose `pct_active_by_age_lfs` matches the current file, so all five
come from the same LFS panel.

| Commit | Date | Static cost | Working-age count | Pension-age count | 16-24 labelled share |
| --- | --- | ---: | ---: | ---: | ---: |
| `29f7038` | 2026-04-08 | £3.83bn | 1,647,420 | 207,633 (65+) | 11.2% |
| `c9937c4` | 2026-04-08 | £3.47bn | 1,495,260 | 204,798 (65+) | 11.0% |
| `a38e66b` | 2026-04-29 | £5.06bn | 1,607,524 | 169,065 (65+) | 12.4% |
| `3e0299c` | 2026-04-30 | £5.06bn | 1,684,173 | 92,416 (66+) | 12.4% |
| `71add6e` | 2026-06-12 | £4.78bn | 1,765,640 | 1,012,805 (66+) | 5.4% |

Each run also changed code or data, so the moves don't isolate the labels'
effect. For example, `71add6e` stopped coding missing LFS pay as £0. Across
the five runs, the working-age count ranged from 1.50 million to 1.77 million
and the static cost from £3.47bn to £5.06bn, while the measured shares stayed
fixed.

## Synthetic demonstration

`synthetic_demo.py` draws LFS-like donors aged 16 to 70 and FRS-like receivers
aged 0 to 80 from one known model. In that model, young, low-paid workers join
most often, about a third of donors earn nothing, and 15% of the donors in
work lose their pay record at random and leave the fit. The script weights
each band's share by the receivers' survey weights.

| Band | True | Direct (donors) | Labels, 1.15.1 | Labels, 3.1.1 | Classifier | Fix |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16-24 | 0.1043 | 0.0979 | 0.0793 | 0.0601 | 0.0849 | 0.0979 |
| 25-34 | 0.0462 | 0.0391 | 0.0169 | 0.0173 | 0.0441 | 0.0391 |
| 35-49 | 0.0244 | 0.0266 | 0.0140 | 0.0055 | 0.0276 | 0.0266 |
| 50-65 | 0.0171 | 0.0171 | 0.0022 | 0.0024 | 0.0194 | 0.0171 |
| 16-65 | 0.0402 | 0.0391 | 0.0220 | 0.0163 | 0.0382 | 0.0383 |
| 66-70 | 0.0087 | 0.0023 | 0.0000 | 0.0000 | 0.0041 | 0 |
| 71-80 | 0.0065 | none | 0.0000 | 0.0000 | 0.0032 | 0 |

In this synthetic data, the labels fall short of the true share in every band
and reach 41% to 55% of it at working age. In the published results, they
exceed the LFS share in three bands and fall short of it in the youngest.
Class labels hold no fixed relation to the share they stand in for, so their
error can run either way.

The classifier alone lands within 14% of the direct share in each working-age
band. The fix scales each band to its direct share, gives 17,538 distinct
values among working-age receivers and gives 0 to everyone else. It matches
the direct shares rather than the true ones, since sampling error in the 6,000
donors separates the two. The real pipeline likewise targets the LFS panel's
measured share.

## The fix

`impute_recently_active` in `src/nics_exemption/imputation.py` replaces the
labels in two steps. First, Microcosm's `CategoricalClassifier` (microcosm-fit
at commit `dc00d158`) fits P(joined recently | age, gender, employment income)
on the panel members whose pay the LFS records, after we scale their weights
to a mean of 1. The classifier then gives every receiver a probability.
Second, the function scales those probabilities by one factor per working-age
band (16-24, 25-34, 35-49 and 50 to SPA − 1), capping each scaled probability
at 1. It picks each band's factor so that the band's weighted mean matches the
LFS panel's weighted share for the band.

- Every weighted panel member in the band, missing pay included, counts
  toward its target.
- When no factor can reach the target, as with class labels whose share falls
  short of it, the calibration raises an error.
- People outside working age get 0, since we cost the reform for working-age
  employees.

In the fix, we assume that each band's share of Enhanced FRS people who joined
recently matches the LFS panel's weighted share for the band.

The pipeline also stops reporting a recently-active count for the pension-age
row of `baseline.by_age`, drops that row from the reform table and limits the
by-age chart to working ages. A new `imputation` block in the results JSON
records the band targets, the classifier's band shares before calibration, the
donor counts and the package versions.

## Limits

- The three cases we price don't bound the cost.
- The pipeline didn't publish population by single age, so "even" and
  "tilted" stand in for the true split within each band.
- To produce the fix's figures, someone has to rerun the pipeline with the
  licensed UK Data Service LFS panels, which this repository doesn't hold.

## Reproduce

```bash
python analysis/recently-active-labels/published_label_gap.py   # standard library only
python analysis/recently-active-labels/published_runs.py        # reads the git history

uv pip install -e ".[imputation]" "microimpute==3.1.1"
python analysis/recently-active-labels/synthetic_demo.py
uv pip install --target /tmp/mi115 --no-deps "microimpute==1.15.1"
PYTHONPATH=/tmp/mi115 python analysis/recently-active-labels/synthetic_demo.py

for v in 1.15.1 2.0.2 2.0.3 2.0.4 2.1.0 2.1.1 3.0.0 3.1.0 3.1.1; do
  uv pip install --target /tmp/mi-$v --no-deps "microimpute==$v"
  PYTHONPATH=/tmp/mi-$v python analysis/recently-active-labels/release_sweep.py
done
```

Each script writes its JSON output beside it, and the outputs here come from
scikit-learn 1.8.0.
