# Reviewer guide

CarbonSat-MRV keeps satellite vegetation results, their coverage and the evidence needed for review together. A reviewer can follow one record from its annual value to a comparison and a complete task export. Two offline unsupervised model families provide complementary prescreening materials; one historical Sepolia registration supplies a public reference for its registered fields.

## Open the project

| Resource | Entry |
|---|---|
| English workbench | https://ryaniamemm-design.github.io/CarbonSat-MRV/web/workbench.html |
| Video demonstration | https://www.youtube.com/watch?v=JDcc-VNmPzY |
| Public source | https://github.com/ryaniamemm-design/CarbonSat-MRV |
| Presentation | `presentation/CarbonSat-MRV_EN_12slides.pptx` |
| Saved models and inputs | `ml/README.md` |

The workbench can also run locally. From the repository root, run `python -m http.server 8777 --bind 127.0.0.1` and open `http://127.0.0.1:8777/web/workbench.html`. The default view uses local assets; a basemap is optional.

## Follow a record through review

1. Open Case A, select `cell_0020` and year `2024`. The displayed annual production rounds to **4,863.54 tC/yr** and the valid-area ratio to **100.00%**. These are product-derived values for the declared footprint.
2. Expand the area details. Inspect geometry area, reduction total area, valid area and the raw annual NPP integral. The labels allow the reader to distinguish the spatial denominator from the integrated quantity.
3. Switch to Case B, year `2024`. The separate Engebei research window has **93.12%** valid-area coverage when rounded to two decimal places. Its result applies to the valid product footprint in that window.
4. Return to Case A, `cell_0020`, year `2016`. Open the evidence panel and follow the located change-ledger link. Record identity is carried through the URL; the ledger independently loads and checks its own input.
5. Inspect `2015 → 2016` inside the 2012–2024 segment. Recompute the ledger and export the complete task list. The current input yields **748 differences**, **34 refused cross-2012 pairs** and **172 review tasks**. The on-screen cell filter does not reduce the complete export.

## Inspect the technical contribution

The contribution has three connected purposes. The two model families organize unusual vegetation-cover and productivity patterns for advisory review. The workbench makes a result's identity, spatial coverage and evidence scope inspectable. The ledger converts its comparison rules into a portable handover containing task triggers, sources and a stable digest.

The historical chain reference has a precise role: a later reader can compare the registered single-record payload hash, method version and declaration category with the corresponding local evidence. The current workbench bundle and task export are off-chain.

## Read further

| Question | Document |
|---|---|
| How are values, areas and comparisons defined? | [Technical method](review/TECHNICAL_METHOD_EN.md) |
| What distinguishes FVC and NPP models? | [Model card](review/MODEL_CARD_EN.md) |
| Which commands reproduce the checks? | [Reproduction guide](review/REPRODUCTION_EN.md) |
| Which results exist and what is the next evaluation? | [Results and evaluation](review/RESULTS_AND_EVALUATION_EN.md) |
| Which files belong to the current publication? | [Publication scope](PUBLICATION_S7.md) |

`examples/worked_record.json` and `examples/review_tasks.json` provide machine-readable counterparts to the route above. They are derived from the packaged inputs. Fresh browser exports can differ in their event timestamp while retaining the same stable digest.
