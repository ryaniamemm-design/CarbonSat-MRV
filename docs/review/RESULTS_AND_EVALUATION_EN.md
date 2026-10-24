# Results, evidence and evaluation plan

## Delivered results

| Capability | Checkable result | Evidence location |
|---|---|---|
| Annual evidence review | 816 cell-years from 34 research cells; separate 24-year Engebei window | Browser bundles and the English workbench |
| Explicit coverage | Three separate area bases; Engebei 2024 valid-area ratio approximately 93.12% | Area details and `examples/worked_record.json` |
| FVC score reproduction | 3,420 stored scores checked against the supplied saved model | `ml/tools/verify_models_readonly.py` |
| NPP score reproduction | 816 stored scores and feature bindings checked | Same read-only verifier and NPP status metadata |
| Review handover | 748 differences, 34 refused boundary pairs, 172 complete tasks | `examples/review_tasks.json` and `web/change_core.js` |
| Stable export identity | Repeat generation retains the same stable digest when only event time changes | Export verifier and example-generation check |
| Historical public reference | One Sepolia descriptive record and its registered fields | `web/chain_anchor_config.json` |
| Existing local technical suite | 331 contract/integration tests passed; 19 model checks and 11 FVC preprocessing regressions passed | Retained verification summary and reproduction commands |

The software checks and score reproductions provide evidence that the supplied implementation behaves as declared for its packaged inputs. They do not establish the accuracy of satellite observations against field measurements.

The complete task example contains **104 `INSUFFICIENT_EVIDENCE` tasks** and **68 `NEED_MATERIAL` tasks**, grouped from **1,496 entry triggers**. The 748 admitted differences have zero entries marked numerically non-comparable for this packaged input; valid-pixel identity remains separately unverified. These are directly recomputed counts, rather than model detection metrics.

## Evidence layers

Internal consistency checks ask whether records, units, totals and digests agree under the implemented rules. Release-reference checks ask whether the current content matches its independent expected reference. Historical source checks ask whether selected records reproduce under their stated protocol.

The historical upstream sample covers 9 of 840 object-years. The remaining object-years were not rerun under that sample check. The current publication preserves this coverage rather than presenting it as a complete upstream evaluation.

The Sepolia record supports comparison with a historical registration of its declared fields. A matching reference does not validate the underlying remote-sensing product or establish a net removal quantity.

## Why the implementation is useful to a reviewer

A record can be handed over with its spatial denominator, product identity, method, evidence scope and next investigation steps still attached. The adjacent-year ledger and source binding help the receiving reviewer locate the same object and understand which comparisons were admitted.

The two anomaly families contribute inspectable prescreening of different observation streams. The ledger contributes an explicit follow-up contract. Keeping their roles separate allows reviewers to examine the model output and the rule-derived task list on their own terms.

These are implemented capabilities. A measured reduction in review time or misunderstanding requires a user study and is not reported as an achieved result here.

## Planned reviewer study

The planned trial follows four tasks: locate a specified record; explain its valid-area denominator; inspect an admitted and a refused year pair; export tasks and continue from a selected trigger. Participants should include environmental researchers who prepare results and reviewers who receive them.

Record task completion, elapsed time, requests for help and interpretation errors. Compare a result-only handover with the contextual evidence workflow using matched tasks and a documented allocation. Report the participant count, prior experience, task order and assistance policy alongside outcomes. Treat the study as evaluation of workflow usability and understanding.

## Planned anomaly evaluation

Build an independently reviewed reference set with event definitions, observation-quality issues and a documented labelling protocol. Distinguish genuine environmental changes from missing-data, sensor and coverage artifacts. Use cells and time intervals separated from model development where the reference data permit it.

Specify how an event is matched to an annual record before measuring performance. Report precision/recall at the chosen review capacity, score-ranking measures where meaningful, and the number of examples supporting each estimate. Compare the two streams separately before considering any fusion rule. Synthetic injection tests remain separately labelled as process tests.

## Further technical priorities

Broaden upstream reproduction with a declared sampling frame. Investigate the 2012 change using product and observation evidence before changing the segmentation rule. Add valid-pixel footprint evidence to distinguish numerical area agreement from spatial identity. Document new study areas with their own scope and method bindings.

Any future credit or causal-restoration use would require additional measurement and methodological work beyond the present annual-productivity review prototype.
