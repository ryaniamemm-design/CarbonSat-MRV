## Inspiration

Environmental monitoring produces results that need to survive review. When a satellite-derived vegetation number moves from a researcher into a report, its footprint, calculation basis and unresolved questions can remain scattered across files. The next reviewer has to reconstruct that context before deciding what the result supports.

**We built CarbonSat-MRV to keep that context attached to the result.**

Our target users are environmental researchers preparing satellite-derived evidence and reviewers receiving it. For **Track 4: Climate Data & Environmental Monitoring**, we address a practical part of environmental transparency: making a result, its supporting evidence and its next review steps accessible together.

## What it does

**CarbonSat-MRV is a satellite evidence workbench that turns a vegetation result into a review handover another person can inspect and continue.**

The prototype brings together **two complementary unsupervised model families**, an English evidence workbench, a linked change ledger and a public reference for one historical blockchain registration.

Follow one record through the demonstration:

1. **Start with the number.** Case A, `cell_0020`, 2024 displays **4,863.54 tC/yr** of modelled annual vegetation production, with its identity and temporal context.
2. **See the footprint behind it.** Open geometry area, reduction total area and valid area alongside the raw integral. Switch to the separate Engebei research window to see why **93.12% valid coverage** belongs beside the result.
3. **Inspect the basis.** The evidence panel distinguishes internal checks, release-reference agreement and applicable historical source checks, each with its stated scope.
4. **Continue the review.** Select the 2016 record, follow it into the located ledger, inspect the 2015→2016 difference, recompute the ledger and export the complete task list.

Case A contains **816 cell-years from 34 research cells over 2001–2024**. Case B contains **24 annual records** for the independent Engebei research window. The ledger yields **748 within-segment differences**, refuses **34 cross-2012 pairs** and exports **172 rule-derived review tasks** with their triggers, sources and stable content digest.

The climate contribution is environmental transparency at the point of review: a receiving researcher can inspect what a satellite result covers, which checks apply and what material is needed next. The product makes that sequence explicit and preserves it in a portable handover.

## How we built it

### Two unsupervised models for complementary observation streams

Vegetation cover and productivity raise different review questions. We use **Isolation Forest** with features tailored to each stream:

| Model family | What it examines | Packaged evidence |
|---|---|---|
| **FVC** | Vegetation cover, observation quality and temporal change | 3,420 annual inputs from 90 cells; seven features; a 72/18-cell training/holdout split |
| **NPP** | Productivity variation, valid-area behaviour and analysis-segment context | 816 annual inputs from 34 cells; eight features; distinct formal, time-holdout and cell-holdout artifacts |

Saved models, feature definitions, inputs and score tables make both implementations reproducible. The models provide **offline advisory prescreening**; the browser presents prepared evidence. The ledger's exported tasks come from explicit comparison rules, keeping model scores and review obligations separately inspectable.

### Coverage and provenance at record level

Google Earth Engine reductions of **MODIS MOD17A3HGF v6.1** and **MCD12Q1** supply derived NPP and land-cover inputs. Annual production integrates NPP density over valid pixel area. Python and Node.js support preparation and verification; HTML, CSS and JavaScript provide the interface.

Record identity carries from the workbench into the ledger. The ledger loads and checks its own input, binds comparisons and tasks to their sources, and separates stable export content from the event timestamp. A later reviewer can reopen the handover and check the same content.

### A public blockchain reference with a defined purpose

Our Solidity prototype uses Hardhat and ethers.js. One historical descriptive record, **`cell_0030_2012`**, was registered on **Sepolia**, preserving its single-record payload hash, method version and declaration category.

The registration gives a later reviewer a public reference for comparing those fields with the corresponding local record. The current full bundle, Engebei case and review ledger remain off-chain. The chain reference complements the local evidence workflow with a precise, checkable registration scope.

### A practical route to adoption

The English prototype is available through a public web link and can run from a local static server, with no frontend build step. The demonstrated review path requires no browser wallet or paid API key. A research group can examine the prepared cases and supplied artifacts before undertaking its own data preparation or model fitting.

The reusable structure is the record-and-task contract: identity, footprint, method, evidence scope and follow-up actions. Extending it to another study area requires documented inputs, a prepared bundle and the corresponding verification checks. That is our planned path to broader use.

## Challenges we ran into

**Preserving the meaning of area.** Geometry area, reduction total area and valid product area answer different questions. We retained all three and put their relationship beside the result so the spatial denominator stays visible.

**Defining defensible comparisons.** A synchronous change around 2012 has an unresolved cause. We split the analysis into two segments and refuse cross-boundary differences, making the comparison rule visible to the reviewer.

**Reproducing model behaviour.** FVC scoring needed the same saved training imputer across preparation and inference. We aligned those paths and verified the corrected scores without retraining the formal forest.

**Keeping a handover comparable across exports.** We bound stable task content to its sources and kept export-event timestamps outside the stable digest. Repeated exports can then preserve content identity while recording each handover event.

## Accomplishments that we're proud of

| Delivered capability | Evidence a reviewer can inspect |
|---|---|
| A working English review route | Record selection, coverage details, evidence inspection and a located change ledger |
| Two reproducible model families | Implementations, saved models and checks for all 3,420 FVC and 816 NPP scores |
| A complete review handover | 172 rule-derived tasks, including their triggers, sources and stable digest |
| A historical public registration | One descriptive record and its declared fields on Sepolia |
| Technical verification | A local run with 331 contract/integration tests passed; 19 read-only model checks and 11 FVC preprocessing regressions passed |
| Materials ready for inspection | Public source, a live English demo, an English demonstration video, a model card, method notes and worked export examples |

## What we learned

Building this prototype taught us to treat footprint, method and unresolved questions as part of the result itself. An anomaly score, a digest and an annual total each answer a different question. Their value in environmental review depends on making those roles clear and keeping the evidence available to the next person.

Our current evidence covers implementation behaviour and stored-score reproduction. Historical upstream reproduction covers **9 of 840 object-years** under its stated protocol. Field accuracy, real anomaly-detection performance and measured user benefits remain to be evaluated. The quantities describe **modelled vegetation productivity**; the prototype does not issue carbon credits or calculate net carbon removal.

## What's next for CarbonSat-MRV

Our next milestone is a structured reviewer trial: locate a record, interpret its coverage, examine an admitted and a refused comparison, and continue from an exported task. We will record completion, elapsed time, misunderstandings and assistance to assess the workflow's practical value.

In parallel, we will develop independently labelled anomaly examples, broaden upstream reproduction, investigate the 2012 break and add valid-pixel footprint evidence. New study areas will follow the same documented input and verification contracts before broader deployment is evaluated.

**Our goal is satellite evidence that the next reviewer can examine, explain and carry forward.**

[Open the English demo](https://ryaniamemm-design.github.io/CarbonSat-MRV/web/workbench.html) · [Watch the demonstration](https://www.youtube.com/watch?v=JDcc-VNmPzY) · [Inspect the source and technical materials](https://github.com/ryaniamemm-design/CarbonSat-MRV)
