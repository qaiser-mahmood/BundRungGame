# Reveal repair and expert-evaluation delivery evidence

Initial delivery used two stacked branches. PR #6 is now merged and PR #7 targets `feature/ai-v3-partnership-learning`:

- PR #6 / `fix/rung-reveal-eligibility`: `8c66679482b1fce2c27ad3217bc62e378c16bddc`, merged into V3 by `ff521e7fb90897f6d895b2094b5dc98a9b4fac2e`. Centralizes request enforcement on advertised engine eligibility. Existing socket identity mapping and caller show sequence were reviewed; wrong-turn/has-suit requests are now rejected before mutation. Locked-card and post-reveal obligations preserved.
- PR #7 / `feature/ai-v3-expert-evaluation`: updated by merging the current V3 base, with no force push. The diff against V3 contains only evaluation changes. Offline engine preparation, authenticated local blind-review service, private persistent revisions, real V2 comparisons, unavailable V3 and canonical V3 annotation export. No production service integration, dependencies or model training.

## Original delivery checks (historical)

- Part 1 focused engine/knowledge checks: **52 tests / 4 files passed**, AI TypeScript passed.
- Final combined focused checks: **114 tests / 9 files passed**. Includes 14 reveal regressions and 15 evaluation tests, plus knowledge, normal reveal, Ace/last-turn, scoring, existing V3 corpus/observation/baseline checks.
- `npm run typecheck:ai`, `npx tsc --noEmit`, `npm run validate:expert-knowledge`: passed.
- `node --check src/expert-review/expert-review.js`: passed.
- Real CLI prepare/export, exported standard-corpus engine replay and existing V3 annotation/status validation: passed. Export correctly has zero human annotations and no usable trained heads.
- Canonical checkpoint SHA256 remains `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

No full suite, browser automation, tournament, self-play or model training was run. HTTP authentication/blinding tests use local loopback; no production game or real expert session was accessed.

## Measured preparation fixture

[Examples](examples/expert-evaluation/README.md) are generated at code commit `84202464b3ea0dfa3af70419a52f623a3a469b16`, seeds 2400000–2400011, 4 train/4 validation/4 holdout deals and 144 candidates. Actual blind assignment: 12 cases, one per initial deal.

Observed coverage: early 5 / middle 6 / late 1; hidden 5 / revealed 7; forced call 8 / voluntary 4; positions 1/2/3/4 = 5/3/1/3; partner currently winning 2 / opponent 5 / leading-or-unknown 5; public void evidence 7; eligible opponent individual streak context 3. No case in this sample has public Ace-downgrade history. Broader/targeted cohorts are still needed for rare conditions; software support and engine tests are not proof of expert-strategy coverage or accuracy.

V2 offline preparation latency, 12 decisions: p50 **3.108 ms**, p95/max **11.609 ms**. Configuration: 8 iterations, 4 particles, node cap 128, seeded RNG, no adaptive allocation or exact solve, no wall deadline during bounded offline work. All 12 choices are legal; actual diagnostics record no fallbacks or invalid worlds in this fixture. These are offline preparation measurements, not concurrent-room/server responsiveness benchmarks or general V2 strength evidence.

One automated technical skip demonstrates persistence without creating an expert label. Agreement rates are null, expert decisions zero, V3 unavailable. No statistical improvement or learning claim can be made.

## Remaining limitations and next steps

Use the [startup/storage guide](AI_V3_EXPERT_EVALUATION.md). The interface is intentionally local and token-authenticated; qualification, access provisioning, backups and cross-study overlap control are curator responsibilities. A writer lock needs manual recovery after a verified dead process. Only one snapshot per deal is available to each expert; no future/alternate views or seeds are exposed by review APIs. Published sample seeds must be excluded from blind studies.

Revisions after AI comparison are audit-only for independent evaluation/training export. Labels without explicitly provided confidence do not become weighted training annotations. Ambiguous/insufficient/skip cases are preserved without invented actions or intentions. Reveal opportunities are automatic rule transitions, not a separate expert reveal-action task. No sequence model, live V3 integration or new trained baseline exists.

Human browser usability has not been independently reviewed. Review the interface manually, curate wider source coverage and qualified independent experts, then collect real blind rankings. Preserve holdout isolation before offline supervised training/calibration and future paired strength/load benchmarks. The ordinary reveal fix is already merged; the evaluation PR does not duplicate it.

## Final PR #7 correction checks

GitHub API access works in the newly published environment. PR #6 is confirmed merged; PR #7 remains open/draft and targets V3. No new PR is created and PR #7 is not merged. No environment/network/security settings were changed during this correction task.

Executed: `ExpertEvaluation.test.ts` (21 tests) and `ExpertControl.test.ts` (12 tests) pass, plus `V3Data.test.ts` (13) and `V3Observation.test.ts` (11). Total **57 tests / 4 files**. `npm run typecheck:ai` and `npx tsc --noEmit` pass; there is no `typecheck` npm script, so the latter is the application TypeScript check. No failures in these executed checks. No model training, tournaments, full integration suite or browser automation ran.

The comparator reuses the existing compact utility, tested against the actual authoritative resolver in eight named fixtures and all their prefixes. Cases include lead being trump, multiple trumps, downgraded Ace, equal effective power, all player/team outcomes, and conservative unknowns for concealed/missing input. No engine, V2 comparator or scoring implementation changed.

A shared read-side review selector chooses the first independent label by revision, prevents later blind-flag revisions from replacing it, treats earlier non-skip ambiguity as AI exposure, and ignores exact duplicate revisions. Conflicting copies fail closed. Report and training export use the same decision; absent original confidence cannot be filled from a later exposed edit. Stored records are not rewritten. HTTP retries now pair the original revision with its original comparison.

The workflow review confirms official-engine generation/replay, strict observation-only display/model inputs, predictions hidden until authenticated submission, server legal-action validation, durable revisions, separate train/holdout provenance, canonical V3 annotation export and unavailable V3. Tests use numerical fixtures only; no human labels were collected or edited. Source-snapshot integrity does not establish human expertise or model strength. Prior sample metrics above remain historical and are not recomputed into new strength claims.

Ready for final review and human expert testing, with manual browser usability, actual expert collection and broader rare-scenario coverage still outstanding. Production game behavior, policy defaults, checkpoints and runtime socket APIs remain unchanged relative to the updated V3 base.
