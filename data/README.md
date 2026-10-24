# data/ — frozen input data for the published demonstration

These are frozen local exports and derived tables. The verification scripts check the current input
bytes; the workbench reads their derived JSON bundles rather than these CSVs directly. Packaging did
not re-sample, smooth or fill these files. This is not a claim that the upstream MODIS product is
unfilled or that its reduction used the complete native pixel grid.

| File | Rows | What it is |
| --- | --- | --- |
| `npp_annual_production_integral.csv` | 816 | Annual NPP production integral for **34 grid cells × 24 years**. One row per cell-year. |
| `npp_annual_landcover_decomposition.csv` | 1523 | Superseded land-cover decomposition retained for traceability; its area denominator and zero-value semantics are not the current valid-footprint method. Do not merge it into current results. |
| `npp_annual_landcover_valid_footprint.csv` | 1523 | Current `MCD12Q1` class decomposition on the valid product footprint. The 23 rows with zero valid class area have blank production and intensity, not measured zeros. |
| `landcover_34_2024.csv` | 34 | 2024 dominant class and class fractions per cell (used for grouping in the ledger). |
| `npp_subset_34_cells.txt` | 34 lines | The public analysis window: the 34 cell IDs. |
| `engebei/engebei_npp_annual_integral.csv` | 24 | Engebei research-window series, 24 years. |
| `engebei/engebei_window_spec.json` | — | Window definition + `windowSha256`, from the cited paper's reported extents. |

## Units and the three area columns

`prod_tC_yr` is tonnes of carbon per year, computed as `Σ(npp × pixelArea) / 1000` over valid pixels.
It is a **model production estimate from `MOD17A3HGF` v6.1**, not a carbon sink, not a stock change,
and not a credit.

Three area columns exist and are **not interchangeable**:

- `geomAreaM2` — the geometric (nominal) cell area;
- `gridTotalAreaM2` — the total area reported by the configured grid reduction (`gridAreaM2` for Engebei);
- `gridValidAreaM2` — the area reported by the same reduction under the valid-NPP mask.

Do not substitute `validPixels × 250000` for area, or for the NPP integral. Counts and weighted area
reductions have different semantics; the resulting area bias can be positive or negative. Do not
silently substitute one area column for another. The class table's `pixelCount` can be fractional;
it must not be read as a count of distinct physical source pixels. Class intensity uses
`classValidAreaM2`, and a zero valid class area leaves production and intensity blank.

The configured reduction uses `SR-ORG:6974` with `scale=500`. That nominal scale is not a complete
native-grid specification. Historical checks found different integrals under alternative grid and
reducer settings; repeating the same configuration does not establish spatial-integration accuracy.

## Engebei research window

All 24 years are `PARTIAL_COVERAGE` with `validAreaRatio ≈ 0.9312`. Every Engebei number therefore
describes **the valid product footprint of that year**, not the full window. The window is the
study-area extent reported in the cited paper (`10.1109/ACCESS.2023.3255879`), which is not a project
or parcel boundary, and it has zero intersection with the 34 cells above. The four object layers
(cell grid, window, paper footprint, published figures) are kept separate and must not be converted
into one another.

The CSV geometry field is `218627848.891752 m²` (about **218.63 km²**), the reduction total is about
**219.53 km²**, and its valid area is about **204.42 km²**. The legacy window metadata also retains
an approximate **218.88 km²** value. These are not interchangeable denominators. An independent
calculation with the stored four corners gives about 218.87853 km² on the WGS84 ellipsoid and
218.62785 km² on a sphere of radius 6371007.181 m, explaining the numerical difference between the
two geometric figures without proving which historical code produced the approximate metadata.
The CSV values and the frozen window specification have not been rewritten.

`validAreaRatio` is the valid area divided by the reduction total, not a quality score, confidence
level or field-validation result. The supplementary S1 data bundle contains a separate 816-row
`mod17_npp_qc_fullperiod.csv` for the 34-cell case, with matching cell-year keys. Its presence does
not mean the current displayed integrals were filtered using a QC threshold; no such filtering is
claimed. For annual gap-filled MOD17, the NPP QC percentage concerns growing-season days requiring
gap-filled FPAR/LAI inputs; it is not the valid-area ratio or a percentage accuracy. See the
[NASA gap-filled product specification](https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/6/MOD17A3HGF)
and [Collection 6.1 user guide](https://modis-land.gsfc.nasa.gov/pdf/MOD17C61UsersGuideV11Mar112021.pdf).

## Deliberate absences

The following are **not published**, so no command in this repository depends on them:

- the Google Earth Engine export scripts used to obtain these CSVs;
- the record-production pipeline that turned the exports into `evidence/`;
- the 2026-10-03 FVC export integration note and the earlier `grid_samples.csv` training sample set
  (the latter is supplied separately in S1, not included in this code tree).

Their absence means you can reproduce **every verification step advertised in the root README** from
what is in this repository, but you cannot regenerate the CSVs themselves from source. Passing the
intake gates recorded in `evidence/` also does not establish attributability: the pipeline still
issues no `REMOVAL` claim and no credit amount.

## Known limits

- `product` and `mask` are recorded per row, but the upstream platform's internal weighting mechanism
  was not independently verified. A 3-object × 3-year spot check (9 of 840 object-years) reproduced
  the values to within 1e-9 — see `audit/upstream_spotcheck_2026-10-19/REPORT.md`. That is a
  spot check under a stated protocol, not a full re-computation.
- Series are split at 2012 as a conservative analysis rule following an observed synchronous break.
  Its **cause remains unverified**; no product change, sensor change or treatment effect is established.
- The `sourceHash` checks bind records to the referenced local source representation. They do not
  authenticate the upstream observations or establish that the CSVs match what the platform returned.
- The supplementary S1 bundle separates current results, upstream context, diagnostics and superseded
  files. Its 90-cell FVC table is not a ground-measurement dataset or the current 34-cell NPP sample.
  `treated`/`control` labels do not identify a verified intervention or counterfactual.
