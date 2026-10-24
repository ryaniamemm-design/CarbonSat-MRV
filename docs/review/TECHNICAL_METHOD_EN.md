# Technical method and data lineage

## Quantities and footprint

The workbench presents annual modelled vegetation productivity from the MODIS annual NPP product. A production total is an area integral of NPP density over the valid product footprint. It is kept alongside its unit, year and spatial identity.

For valid pixels indexed by `p`, the packaged method describes:

```text
integral_kgC_yr = sum(NPP_scaled[p] * pixelArea_m2[p])
prod_tC_yr     = integral_kgC_yr / 1000
validAreaRatio = validArea_m2 / reductionTotalArea_m2
```

The stored inputs name `MODIS/061/MOD17A3HGF`, band `Npp`, scale factor `0.0001`, a declared valid-raw-value mask, CRS `SR-ORG:6974` and a 500 m reduction scale. Land-cover context comes from `MODIS/061/MCD12Q1`. The mask and reduction method are part of the product interpretation. The 500 m configuration is not a claim of complete native-grid integration, and the displayed integrals do not claim an additional QC-threshold filter.

Three areas are retained because they answer different questions:

| Area | Meaning | Case A field |
|---|---|---|
| Geometry area | Area of the declared research geometry | `geomAreaM2` |
| Reduction total area | Pixel-area total returned under the declared reduction | `gridTotalAreaM2` |
| Valid area | Area with valid NPP values under the declared mask | `gridValidAreaM2` |

Geometry and reduction area need not be numerically identical. The interface shows their values rather than silently substituting one for another. A positive total applies to the valid footprint; partial coverage is retained as an interpretation condition.

## Independent case scopes

Case A contains 34 research cells and 24 annual observations per cell, giving 816 cell-years for 2001–2024. Cell identities and the geometry rule are stored in `web/npp_estimate_bundle.json`. The production CSV contains cell identity, year, three areas, the NPP integral, its converted production total and method fields.

Case B contains 24 annual records for a separate Engebei research window. Its stored bounds are 109.288888889–109.466666667°E and 40.308333333–40.438888889°N. The window follows the study extent recorded in the project materials for DOI `10.1109/ACCESS.2023.3255879`. Its enclosing rectangle is a research window, and the bundle separately records the paper-reported area and rectangle area. They have different spatial bases. Each annual record retains its coverage status; the 2024 valid-area ratio is approximately 0.93116.

The two scopes are displayed separately. Neither supplies an official project boundary or a causal treatment/control comparison.

## Packaged data path

| Stage | File or directory | Role |
|---|---|---|
| Prepared annual production | `data/npp_annual_production_integral.csv` | Frozen Case A area integrals and method fields |
| Land-cover decomposition | `evidence/a2_landcover_valid_footprint.json` | Product-footprint land-cover context |
| Case A browser input | `web/npp_estimate_bundle.json` | Prepared annual records and provenance |
| Case B browser input | `web/engebei_bundle.json` | Research-window records and scope |
| Release references | `web/*.pin.json` | Declared byte/content references for those bundles |
| Evidence registry | `web/workbench_evidence_registry.json` | Binding to the relevant packaged reports |
| Offline model materials | `ml/project/` | Separate training/scoring inputs and saved artifacts |

The model inputs are not interchangeable with area-integrated workbench totals. In particular, NPP-model input `npp_kg_m2_yr` is a density feature, whereas `prod_tC_yr` is an integrated production total.

## Comparison contract

The ledger compares adjacent years of the same cell inside one analysis segment: 2001–2011 or 2012–2024. A common change around 2012 has an unresolved cause. The comparison rule therefore refuses 2011→2012 rather than supplying a cross-boundary difference.

For 34 complete cells, the permitted adjacent-year structure gives `34 * (10 + 12) = 748` within-segment entries and 34 refused boundary pairs. Product/method compatibility, usable finite values and numerical area relations determine whether a difference is produced. Valid-pixel identity remains a separate, unresolved condition: equal numerical areas do not establish the same pixel locations.

Tasks are derived from the implemented ledger rules, grouped with their triggers and bound to record identity and sources. Their generation is separate from the offline Isolation Forest scores. The current complete export contains 172 tasks. No difference-magnitude ranking is implied by the identity-based ordering.

## Handover integrity

The source reference binds input bundle identity, relevant source references and method declarations. Ledger entries, tasks and stable export content have their own digests. The export's `event.generatedAtUTC` is outside stable content, so two export events can preserve the same stable digest while retaining distinct timestamps.

Internal recomputation tests consistency. A match against an independent release reference tests agreement with that reference. Historical upstream checks apply only to the records and protocol they cover. These forms of evidence remain separately visible.

## Historical chain reference

The historical Sepolia record is `cell_0030_2012`, chain ID `11155111`, at EvidenceAnchor `0x248EFE2E5579613d47e9Abe743d7528fBECE3c88`. It registers a single-record payload `packHash`, `methodVersion` and `declarationCategory`; the method is `CarbonSat-NPP-Evidence-v1.0` and category `DESCRIPTIVE_NPP_ONLY`. The configuration and explorer links are in `web/chain_anchor_config.json`.

The public reference supports later comparison of those registered fields. The full current bundle, Engebei case and review ledger are off-chain. Annual NPP describes modelled productivity; this prototype does not calculate net carbon removal, issue credits or establish restoration causality.
