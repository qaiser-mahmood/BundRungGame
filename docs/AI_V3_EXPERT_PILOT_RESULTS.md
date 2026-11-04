# Phase 4 pilot preparation evidence

Prepared on `feature/ai-v3-expert-pilot`, based on V3 after merged PR #7 (`241a8eb`). No model training, policy activation, production game/scoring change or public interface deployment.

## Reproducible proposed cohort

The actual CLI `prepare-pilot` ran with seed 3100000, 15 source deals per split, all available multi-choice positions (cap 52/deal), mixed calling and generator source commit `dce683e6a8260f5af4aed401fdbc679f05059658`. It generated **1,595 candidate frames from 45 legally played deals**, then replay-matched 15 selected decisions. Manifest: `32bc7693d91a712a0575126ca7bafbd6e80a2f649b79de7544c8de8f68912c26`. The [machine-readable report](../benchmarks/ai-v3-expert-pilot-coverage.json) records counts, targets and provenance. Source-commit metadata changes hashes if regenerated from a later documentation/UI-only commit; selected cards/positions depend on the seed, engine play and versioned selection algorithm, not those provenance hashes.

| Observable category | Selected count |
| --- | ---: |
| Early / middle / late | 5 / 5 / 5 |
| Playing positions 1 / 2 / 3 / 4 | 4 / 4 / 3 / 4 |
| Hidden / revealed rung | 8 / 7 |
| Forced / voluntary call | 8 / 7 |
| Partner / opponent currently winning | 4 / 7 |
| Leading or unknown winner | 4 |
| Own strong / weak suit proxy | 12 / 11 |
| Public void evidence | 10 |
| Current Ace downgrade / next-Ace lead risk | 1 / 1 |
| Public Ace-downgrade history | 5 |
| Eligible individual opponent streak context | 4 |
| Partner-control choices | 4 |
| Train / validation / holdout deals | 5 / 5 / 5 |
| At least three legal actions | 15 |
| Repeated initial deals / exact duplicate observations | 0 / 0 |

All declared minimum targets are met; shortfall list is empty. Overlapping coverage tags are collection proxies, not intent labels, action recommendations or claims of expert difficulty. Balanced selection deliberately oversamples rare contexts and is not a representative strength test.

## Executed checks

- **67 focused tests across 5 files pass:** ExpertPilot (10), ExpertEvaluation (21), ExpertControl (12), V3Data (13), V3Observation (11).
- `npm run typecheck:ai`, `npx tsc --noEmit` and `node --check src/expert-review/expert-review.js`: pass. Static client element references also checked against HTML IDs.
- Real CLI pilot preparation, canonical corpus/annotation export, existing `v3:data verify` engine replay and annotation-status checks pass. Export has **zero human records**; no label was fabricated or supplied.
- Canonical checkpoint remains SHA256 `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

One `V2_INTERNAL_FAILURE` diagnostic occurred during preparation and tests. The existing V2 controller returned a legal fallback for **1 of 15** cases; 14 completed eight iterations each, 112 total. Actual metadata records fallback=true and one invalid-world/internal-failure counter. The page labels this as a fallback after submission. It is not hidden, not called a completed search, and not repaired by changing strategies in this collection task. All frozen actions satisfy the official legal mask. No V3 output exists; V3 remains unavailable.

## Pilot readiness and remaining review

Owner instructions, including exact PowerShell setup/private token/ACL commands, resume, backup and export, are in [AI_V3_EXPERT_PILOT.md](AI_V3_EXPERT_PILOT.md). All 15 inputs and saved revisions are persistent and reproducible. The server resumes the first untouched case; old AI-exposed edits cannot replace independent labels. Authentication and loopback-only serving are retained; no hosting infrastructure added.

Windows/PowerShell and manual browser usability have **not** been executed in this Linux environment (PowerShell is unavailable). Automated HTTP/privacy/persistence checks are not a substitute for that human pilot. The public bidding information is a final-status/pass-count summary, not a full transcript. Qualification, keeping reference seeds/bundles away from blind review and cross-study overlap checks remain curator responsibilities. Broader expert data, baseline quality, learned V3 strength and statistical improvement remain unverified.


## PR #8 workflow corrections

Progress now separates completed expert decisions from not-reviewed, skipped, ambiguous and insufficient cases. The first untouched case remains the resume target; an all-visited summary reports unresolved/skipped totals explicitly. Skip-to-decision revisions retain history and stay blind until the genuine saved submission.

The client journals exact pending request bytes/ID in browser storage before sending, and restores/reconciles on refresh. A new authenticated own-request lookup returns only the saved submission/receipt/comparison, or found=false with no AI data. Absence permits an identical idempotent retry; uncertain outcomes block new submissions/navigation. Explicit pre-save rejection differs from network/internal-server uncertainty, including failures after commit. No training/export contract or production API changes.

Browser storage must remain available at the original origin/profile while intent is pending. Saved server labels do not depend on it. Manual Windows/browser testing remains outstanding; focused tests exercise the actual client recovery module and real local authenticated HTTP rather than heavy browser automation.

Correction validation: **78 focused tests across 6 files passed** (11 recovery/state tests plus the existing 67 pilot/evaluation/control/data/observation checks). Both `npm run typecheck:ai` and `npx tsc --noEmit` passed. Both review-client JavaScript modules passed syntax checks; referenced element IDs were checked against the HTML. The existing V2 fallback diagnostic still appears in the pilot fixture and remains disclosed above. No new model training, heavy browser automation or production changes.
