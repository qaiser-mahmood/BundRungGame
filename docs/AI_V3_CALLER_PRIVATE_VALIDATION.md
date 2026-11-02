# Caller-private correction validation

## Confirmed defect and repair

V1 observations removed the acting caller's selected suit and locked card; the evaluation wrapper also removed those fields before calling V2. The official engine already provides them privately to the actual caller. New v2 observations and evaluation inputs retain this legitimate knowledge without extending the engine legal mask or public state. Non-callers remain unable to receive caller-private fields. Relative-seat mapping uses actual player IDs.

Legacy v1 extraction remains for exact replay, not new data collection. Original bundle, assignment, hashes, credentials and reviews are never regenerated in place. A local migration verifies a complete private backup, regenerates the original corpus in memory, then replays all assigned cases. It refuses unresolved evidence. The audit and separate revisioned correction ledger are new files.

Only saved hidden-caller cases get the Keep/Change question. Unaffected decisions require no action. An affected unreviewed case uses the normal corrected view. Original decisions and old V2 outputs remain intact; only affected V2 comparisons are rerun. Exposed corrections are never independent labels. Affected legacy records stay excluded from automatic training exports even after confirmation, pending an explicit compatible feature/training policy.

## Validation scope

The focused suite covers caller/noncaller privacy, all four relative caller positions, unchanged legality, legacy replay hashes, tampered replay refusal, verified backup and original-file preservation, idempotent migration, keep/change history, blind comparison gating, export quarantine and authenticated lost-response reconciliation. A synthetic engine-generated 15-case assignment contains 14 software-written review records solely to test preservation. These are not human annotations or model-training data. Small client-function tests execute the actual form restoration adapter without browser automation, including refreshed correction journals that omit normal-review ranking fields.

Exact focused command:

```bash
npx vitest run --no-file-parallelism __tests__/CallerPrivateKnowledge.test.ts __tests__/ExpertClientRestore.test.ts __tests__/ExpertPilot.test.ts __tests__/ExpertEvaluation.test.ts __tests__/ExpertSaveRecovery.test.ts __tests__/ExpertControl.test.ts __tests__/V3Observation.test.ts __tests__/V3Data.test.ts __tests__/V3Baseline.test.ts __tests__/CloseRungAceAndLastTurn.test.ts __tests__/NormalPlayRungReveal.test.ts
npm run typecheck:ai
npx tsc --noEmit
node --check src/expert-review/expert-review.js
node --check src/expert-review/save-recovery.js
```

Final result: **112 tests passed in 11 files** (24.55 seconds); both TypeScript checks and both JavaScript syntax checks passed. HTTP fixture tests require loopback networking; a restricted-network execution timed out, then the suite was rerun with the supported loopback-capable execution permission. No environment security configuration was changed.

## Owner migration and limitations

Follow [the Windows migration and correction instructions](AI_V3_CALLER_PRIVATE_CORRECTION.md). No owner data was accessed in this development environment. Consequently the actual affected-case count and real before/after agreement remain unknown until the owner runs the local audit; test-fixture counts must not be substituted. The CLI reports the exact count from the original private directory. Neither private pilot data nor personal tokens should be uploaded.

Manual Windows/browser operation remains to be confirmed locally. V2 retains its existing search/fallback diagnostics; historical fixture preparation can emit its existing internal-failure fallback diagnostic, which is not hidden or claimed as a successful search. There is no playing-strength claim. No training, tournaments, new dependencies, production policy changes, engine changes, Socket.IO changes or canonical checkpoint changes were made. The new 629-feature schema is explicitly refused by the old 519-input experimental baseline rather than silently truncated.
