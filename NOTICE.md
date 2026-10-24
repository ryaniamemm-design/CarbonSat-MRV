# Notices: data, third-party code and licence status

This repository is a competition submission, published for evaluation. It is **not** released
under an open-source licence yet — see "Licence status" below.

## 1. Data sources

| Product | Use in this project | Terms / attribution |
|---|---|---|
| `MODIS/061/MOD17A3HGF` v6.1 (annual NPP, 500 m) | Primary NPP input; integrated per footprint cell and year | NASA MODIS land products are free and open (NASA EOSDIS). Retrieved through Google Earth Engine; not redistributed as raw granules. |
| `MODIS/061/MCD12Q1` (annual land cover) | Land-cover composition per cell-year | Same as above. |
| Engebei research window | Bounding window derived from a published study area | Paper: *IEEE Access*, DOI `10.1109/ACCESS.2023.3255879`. The window is the **reported research extent**, not an official project boundary. Only derived, aggregated annual values are included here. |

The two scientific CSVs in `data/` are byte-frozen inputs to every verification command in the
README. They are **derived aggregates** (per cell-year, per land-cover class), not raw satellite
imagery.

## 2. Third-party code

| Component | Location | Licence |
|---|---|---|
| ethers.js v6 UMD build | `web/vendor/ethers.umd.min.js` | MIT (© Richard Moore / ethers contributors) |

No other third-party runtime library is bundled. The pages use no external fonts, no CDN scripts
and no analytics.

## 3. Licence status

**No licence file is provided, and no open-source licence is claimed.** `package.json` is marked
`UNLICENSED` so that automated tooling does not infer a licence that the author has not granted.

If you need to reuse this code, contact the author. The absence of a licence means the default
"all rights reserved" applies.

## 4. Scope of the numbers

Values shown in the workbench are modelled NPP production integrals. They are **not** carbon
sink, carbon removal, credit or offset quantities, and nothing here is a certification.

## 5. Publication edits

One run record (`audit/one_record_anchor/source_binding_result.json`) contains two fields that were
absolute paths on the machine that produced it. In this repository those two fields are rewritten to
repository-relative paths, and the file carries a `publicationNote` naming the fields that changed.
No value, flag or detail was altered; the working copy retains the original record.

