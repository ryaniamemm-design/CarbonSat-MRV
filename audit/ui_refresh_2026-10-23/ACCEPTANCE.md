# English review workbench · acceptance record · 2026-10-23

User-authorized presentation update: workbench v1.2 and ledger UI v1.4. Existing scientific cores, datasets, bundles, pins, claim records and export protocol remain unchanged. Old v1.1 manifest and acceptance text are preserved. The new workbench manifest covers 17 files, including linked ledger presentation files and its contract.

The interface uses English by default, a map-first three-column layout, grouped map controls, explicit value/coverage/evidence sections, and a taller annual-series chart. Source truth, field accuracy, partial coverage and historical applicability retain distinct scope and status. Original fixed Chinese source statements and diagnostics remain in labelled details and unchanged machine exports. No external UI framework, font, CDN or new scientific computation was added.

Actual checks: independent workbench 50/50; Engebei 53/53; registry 2/2; module manifest 17/17; manifest counterexamples 27/27. The 89 original workbench/ledger core tests passed using Node's built-in runner and compatibility bindings; the full npm/Hardhat compilation and 331-test historical suite were not rerun.

Browser checks at 1366×768 and 1920×1080 showed no horizontal overflow. Map shares were approximately 56.5% and 60.4%; all 34 cells fitted at default view. Case A values and year switching, case B partial coverage, non-sampled-year warnings, disabled case-B ledger path, located ledger navigation, 748-entry recomputation, 172-task download and rejection of invalid JSON were observed. Invalid input retained the previous verified ledger and was not adopted. The downloaded stable content and stableDigest matched the pre-update export exactly.

Evidence files, before/after screenshots and original presentation backups are in the handoff's verification/ui_refresh/ (or the development workspace local_review_2026-10-23/ui_refresh/). A structured result file records the actual scope. These are software checks, not participant usability evidence or scientific validation.

Design references: https://github.com/shadcn-ui/ui , https://github.com/keplergl/kepler.gl , https://github.com/tremorlabs/tremor , https://github.com/nasa-gibs/worldview . Used as references for hierarchy, map-panel organisation and chart treatment. Implementation is original vanilla HTML/CSS/JS, not copied framework components or an endorsement.

The interim public demo has not been redeployed. GitHub, actual video and Devpost remain incomplete. Existing PPT screenshots can show the prior Chinese interface; use the current local English interface for a new recording.
