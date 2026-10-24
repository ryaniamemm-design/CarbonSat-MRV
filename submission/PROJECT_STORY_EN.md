## Inspiration

**4,863.54 tC/yr.** That is the modelled annual vegetation production shown for one record in our workbench. To use it, a reviewer needs to know which footprint it covers, how it was calculated, which comparisons are valid and what evidence should be checked next.

Those questions become harder when satellite results move between spreadsheets, presentations and environmental reports. The number travels; its coverage, source context and unresolved questions can get left behind.

We built **CarbonSat-MRV** to keep that context with the result. For **Track 4: Climate Data & Environmental Monitoring**, our focus is practical environmental transparency: helping researchers hand over satellite evidence that another person can inspect and continue reviewing.

## What it does

**CarbonSat-MRV is a satellite evidence workbench for environmental review, supported by two complementary unsupervised model families and a historical blockchain registration reference.**

The reviewer has a concrete path through the product:

1. **Locate a result.** Select a research object and year; inspect annual production, its unit and temporal context together.
2. **Understand its coverage.** Compare geometry area, reduction total area and valid product area, with the valid-area ratio beside the result.
3. **Inspect the evidence.** Distinguish internal consistency, agreement with a release reference and applicable historical source checks.
4. **Carry the record into review.** Follow the selected cell and year into the change ledger, inspect an adjacent-year difference, recompute the ledger and export the complete task list with its stable content digest.

The prototype makes these choices visible through two independent cases. **Case A** contains **816 cell-year records from 34 research cells over 2001–2024**. **Case B** is a separate Engebei research window with **24 annual records**, each with partial valid coverage of approximately **93.12%**. Coverage changes the interpretation of a result, so the interface presents it as part of the result itself.

The ledger produces **748 within-segment differences**, refuses **34 comparisons across the 2012 boundary**, and exports **172 rule-derived review tasks**. A reviewer receives record identity, sources and concrete next steps together.

## How we built it

### Complementary anomaly prescreening

Vegetation cover and productivity expose different observation patterns. We use two **Isolation Forest** model families with feature sets tailored to those streams:

| Model family | Review focus | Packaged inputs |
|---|---|---|
| **FVC** | Vegetation cover, observation quality and temporal change | 3,420 annual inputs from 90 cells; seven features |
| **NPP** | Productivity variation, valid-area behaviour and analysis-segment context | 816 annual inputs from 34 cells; eight features |

The FVC spatial split holds out 18 cells from 72 training cells. The NPP materials distinguish formal scoring from time-holdout and cell-holdout evaluation. Saved models, inputs, feature definitions and score tables make both implementations inspectable.

These models provide **offline advisory prescreening**. The workbench presents prepared evidence; its exported review tasks are derived from ledger rules. The model scores and the task queue have explicit, separate roles.

### Evidence that remains attached to the record

Google Earth Engine reductions of **MODIS MOD17A3HGF v6.1** and **MCD12Q1** supply derived NPP and land-cover inputs. Annual production integrates NPP density over valid pixel area. We retain the separate area definitions and declare the spatial and temporal scope of each case.

Python and Node.js support preparation and verification. HTML, CSS and JavaScript provide the English interface using local assets, with no frontend build step. Selecting a record carries its identity into the ledger, where the comparison, supporting material and review tasks can be inspected together.

### A public reference for later comparison

Our Solidity registration prototype uses Hardhat and ethers.js. One historical descriptive record, **cell_0030_2012**, was registered on **Sepolia**, preserving a single-record payload hash, method version and declaration category as a public reference.

This gives a later reviewer a reference for comparing those registered fields with the corresponding local record. The current full bundle, Engebei case and review ledger remain off-chain; the historical reference and local evidence checks serve distinct purposes.

## Challenges we faced

**Keeping area definitions consistent.** Interchanging valid area, reduction total area and geometry area can change what a result means. We retain all three and present their relationship directly in the interface.

**Handling an unresolved temporal break.** A synchronous change around 2012 has an unverified cause. We split the analysis into two segments and explicitly refuse cross-boundary differences, giving reviewers an inspectable comparison rule.

**Reproducing model scores.** We aligned the FVC producer and inference paths around the saved training imputer. The corrected score table reproduces without retraining the formal forest; the repair history and regression checks remain available with the model materials.

**Handing work to the next reviewer.** We separated stable task content from export-event timestamps so repeated exports can be compared while preserving when each handover occurred.

## Accomplishments that we're proud of

| Delivered capability | Concrete evidence |
|---|---|
| An English review workflow | Record selection, coverage inspection, evidence details and a linked change ledger |
| Two inspectable model families | Implementations, saved models, inputs and reproducible checks for 3,420 FVC and 816 NPP scores |
| A review handover | Complete export of 172 rule-derived tasks with a stable content digest |
| A historical blockchain reference | One descriptive record registered on Sepolia |
| Local technical verification | 331 contract/integration tests passed in a local run; 19 read-only model checks and 11 FVC preprocessing regression tests passed |

## What we learned

Environmental transparency becomes practical when the person reading a result can inspect its meaning and decide what to investigate next. Keeping coverage, evidence scope and follow-up work together is central to that experience.

Our intended users are environmental researchers preparing satellite-derived results and reviewers receiving those results. The prototype provides an inspectable starting point for their handover. Independent user trials will test whether it improves task completion and understanding.

The current quantities describe **modelled vegetation productivity**. Field accuracy, restoration causality, real anomaly-detection performance and user benefits remain to be evaluated. Historical upstream reproduction covers **9 of 840 object-years** under its stated protocol. The prototype does not issue carbon credits or calculate net carbon removal.

## What's next for CarbonSat-MRV

We will run a structured reviewer trial around the demonstrated workflow: locate a record, interpret its coverage, inspect a difference and continue from an exported task. We will record completion, misunderstandings and feedback to guide product changes.

Next technical priorities are independently labelled anomaly examples, broader upstream reproduction and investigation of the 2012 break. Additional study areas can follow the same record-and-task structure with documented inputs, explicit scope and verification contracts; large-scale operation remains a future test.

**Our goal is to make satellite evidence useful at the point where someone must examine it, explain it and hand the work on.**
