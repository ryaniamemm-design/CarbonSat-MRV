# Model card: complementary vegetation anomaly prescreening

## Intended use

The FVC and NPP families use Isolation Forest to provide advisory anomaly scores for research review. Vegetation-cover observations and annual productivity expose different patterns, so each family uses a feature set suited to its input stream. The scores help identify observations worth examining; they do not classify independently confirmed environmental events.

The English workbench presents prepared evidence. It does not execute live model inference. Its 172 review tasks are produced by ledger rules rather than by these anomaly scores.

## Model and artifact roles

| Family or role | Input/split | Packaged artifact |
|---|---|---|
| FVC formal model | 3,420 annual observations, 90 cells, 1987–2024; 72 training cells and 18 held-out cells | `ml/project/evidence/anomaly_model.joblib` |
| NPP formal scoring | 816 observations, 34 cells, 2001–2024 | `ml/project/evidence/npp_anomaly/npp_anomaly_model.joblib` |
| NPP time holdout | 544 training observations through 2016; 272 test observations in 2017–2024 | `ml/project/evidence/npp_anomaly/npp_anomaly_model_timeholdout.joblib` |
| NPP cell holdout | 624 training observations from 26 cells; 192 observations from 8 held-out cells | `ml/project/evidence/npp_anomaly/npp_anomaly_model_cellholdout.joblib` |
| Isolated FVC smoke test | Synthetic process-test role | `ml/project/evidence/smoke/anomaly_model.joblib` |

Five saved artifacts represent two formal model families and separate evaluation roles. The synthetic smoke artifact retains its explicit synthetic status.

## FVC feature definitions

The input is `ml/project/data/grid_samples.csv`. Records are keyed by cell and year and include coordinates, observation-quality fields and the declared endmember method.

| Feature | Information carried |
|---|---|
| `fvc` | Annual fractional vegetation-cover value |
| `ndvi` | Annual NDVI value supplied in the input |
| `clearPixelRatio` | Clear-observation ratio |
| `spatialCoverage` | Spatial observation coverage |
| `sensorAgreement` | Recorded sensor-agreement value, with saved training imputation when missing |
| `fvcJump` | Absolute change from the previous available annual row of the same cell; first row is zero |
| `yearNorm` | Declared linear year normalization |

The CSV retains its shared endmember scope and year range. A cell holdout in the anomaly model does not by itself establish independence of every upstream data-preparation choice.

FVC v1.1 consistently reuses the saved training imputer in feature preparation and inference. The saved sensor-agreement fill value is approximately `0.9831054395`; it is the training median recorded with the artifact. Scoring requires matching model, preprocessing and feature metadata, and rejects a missing or mismatched saved imputer.

The repair did not retrain the formal forest. Relative to the original snapshot, 111 rounded grid scores changed by at most 0.0005. Grid flags and existing claim scores/flags remained unchanged. The current 3,420 saved scores can be reproduced from the supplied inputs and model.

## NPP feature definitions

The input is `ml/project/data/npp_subset_fullperiod.csv`, containing `cellId`, coordinates, `year`, `validAreaRatio` and `npp_kg_m2_yr`.

| Feature | Implementation meaning |
|---|---|
| `npp` | Input NPP density in kgC/m²/yr |
| `nppJump` | Absolute difference from the preceding per-cell NPP value |
| `nppRelJump` | Absolute NPP change divided by the absolute preceding value, with a `1e-6` denominator floor |
| `nppZscore` | Departure from a saved training median, scaled by `1.4826 * MAD`; zero-scale cases use the implemented fallback |
| `validAreaRatio` | Input valid-area ratio |
| `varJump` | Absolute change in valid-area ratio |
| `yearNorm` | Year normalized using the saved training-year range |
| `eraFlag` | Indicator for year ≥ 2012 |

Feature parameters are fitted on the training partition for each evaluation artifact. For cells absent from training, the code uses the training-derived global median and MAD. Time-holdout transformations retain their training-year normalization; years beyond the training maximum may consequently normalize above one.

The first time-test-year jump uses the final available training-year state for that cell, followed by carry-forward from previously encountered test years. The saved training median/MAD and year parameters are not refitted on the test rows. These procedures can be inspected in `compute_feature_params`, `transform_features` and `_last_year_state` in the NPP implementation.

## Scoring configuration

Both implementations use 200 trees and configured contamination `0.05`. The source fixes seeds `20260924` for FVC and `20261005` for NPP. Both define the score as the negative of `decision_function`, so larger values indicate greater model-relative unusualness. Configured contamination controls the model threshold; it is not an independently measured prevalence of real anomalies.

FVC and NPP scores have separate feature distributions and training roles. They are not fused into a common calibrated probability. The NPP formal artifact supplies its saved score table; holdout artifacts serve their stated evaluation partitions.

## Reproduction and evaluation scope

`ml/tools/verify_models_readonly.py` checks expected artifact/input hashes, forbids fitting during verification, reproduces 3,420 FVC and 816 NPP scores and checks that model bytes remain unchanged. Eleven FVC preprocessing regressions exercise imputation, metadata consistency, grid/claim feature alignment and score reproduction.

Synthetic injection tests and score reproduction provide process evidence. Independently labelled real anomalies, field accuracy and measured reviewer benefit remain evaluation priorities. The packaged scores are not carbon-credit quantities, production forecasts or causal treatment-effect estimates.
