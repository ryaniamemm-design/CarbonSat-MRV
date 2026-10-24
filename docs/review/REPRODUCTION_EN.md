# Reproduction guide

Run the commands below from the repository root. The static interface, integrity checks, model reproduction and contract tests have separate requirements. The supplied inputs and model artifacts allow the reviewer to inspect an existing result without starting a new training run.

## 1. Check the publication bytes

```bash
python scripts/verify_release.py
node scripts/build_workbench_evidence_registry.js --verify
python scripts/verify_workbench_module.py --verify
node scripts/verify_engebei_case.js
```

Python standard-library support and Node.js are sufficient for these checks. A successful publication verification reports `ok: true` and an empty error list. The evidence-registry check compares the registered report and artifact bindings; the module check compares its current manifest. The Engebei verifier checks that case's preparation and scope independently of interface rendering.

`PUBLICATION_MANIFEST.json` covers current publication files and declares its exclusions. Historical module manifests describe earlier byte versions. Use the current `MODULE_MANIFEST_S6.json` for this publication; a mismatch against a historical manifest is not a reason to rewrite historical scientific inputs.

## 2. Serve the interface locally

```bash
python -m http.server 8777 --bind 127.0.0.1
```

Open the following route:

```text
http://127.0.0.1:8777/web/workbench.html?case=A&object=cell_0020&year=2024
```

Use HTTP so the browser can load sibling JSON files. The page has no frontend build step. Keep the default basemap disabled for a review path based on local assets. Follow the demonstration route in [the reviewer guide](../REVIEWER_GUIDE_EN.md), including the separate Engebei case and the located 2016 change ledger.

A successful local run displays 4,863.54 tC/yr for the stated Case A record and approximately 93.12% valid-area coverage for Engebei 2024. The ledger exposes 748 within-segment differences, 34 refused boundary pairs and 172 complete tasks. Check the actual JSON download rather than relying only on a button being enabled.

## 3. Reproduce saved model scores

Use Python 3.12 with the versions pinned in `ml/requirements.txt`: NumPy 2.5.3, pandas 3.0.6, scikit-learn 1.9.1, joblib 1.6.0 and SciPy 1.18.1.

```bash
python -m venv .venv
```

Activate that environment using the command for the operating system, then run:

```bash
python -m pip install -r ml/requirements.txt
python ml/tools/verify_models_readonly.py
python ml/project/pipeline/tests/test_fvc_preprocessing.py
```

The read-only verifier reports 19 named checks. It verifies artifact/input bindings before loading the trusted packaged model files, prohibits fitting, compares all 3,420 FVC scores and all 816 NPP scores, and verifies model-byte preservation. The regression file reports 11 FVC preprocessing tests.

Saved joblib files should be loaded only from a trusted source. A checksum establishes agreement with the accompanying manifest; trust in the publisher is a separate question.

The direct entry points of the training modules can write new artifacts. For this reproduction route, run the read-only verifier and regression file above. Any experimental fitting should use a separate copy with its own output paths and recorded environment.

## 4. Inspect a complete export

`examples/review_tasks.json` contains a task export derived from the packaged Case A bundle. Its stable part contains the ledger, complete task list and source binding; its event envelope records when the example was generated.

Compare `stableDigest` when checking exports generated at different times. A change in `event.generatedAtUTC` alone does not imply a change in task content. The sample accompanies the code used to generate and verify it and is covered by the publication manifest.

`examples/worked_record.json` records the selected Case A 2024 value, area fields, Engebei 2024 coverage and the located 2016 ledger route. Values retain their source units and are accompanied by the corresponding input hashes.

## 5. Contract and integration suite

The repository provides locked npm dependencies and a Solidity 0.8.26 configuration:

```bash
npm ci
npm test
```

Dependency installation and a first compiler acquisition require a suitable network connection or an existing local cache. The retained 331-test result was obtained in a separate verification copy using the existing dependency environment and a local solc 0.8.26 override when remote compiler download was unavailable. It does not claim that a fresh network installation was executed during this documentation update.

Local Hardhat tests use an ephemeral local chain. This reproduction does not require a wallet, private key or new Sepolia transaction. The historical public registration can be inspected separately through the explorer links in `web/chain_anchor_config.json`.

## 6. Understand mismatches

A publication hash mismatch calls for identifying which current file differs. A model version or imputer mismatch calls for using the matching saved artifact and preprocessing metadata. A bundle verification failure calls for inspecting the failed structure, content or release-reference check before using its results.

A numerical match confirms the stated reproduction. It does not supply field observations, a causal restoration study or independently labelled anomaly events. Keep the reproduction result attached to its input version and declared scope.
