# Focused validation record

No training, self-play, tournament, production build or full integration suite was run for this documentation-focused change.

| Check | Result |
| --- | --- |
| `npm run validate:expert-knowledge` | Pass: schema 1.0.0; 28 principles, 20 narrative scenarios, 6 corrections; zero training examples |
| `npx vitest run __tests__/ExpertKnowledge.test.ts` | 22/22 pass |
| Focused existing Ace/last-turn, normal reveal and scoring tests | 34/34 pass across 3 files |
| `npm run typecheck:ai` | Pass |
| Canonical checkpoint SHA256 | `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`, unchanged |

Engine review covered `submitBid`, `getLegalCardsForPlayer`, `playCard`, `getRevealPermissions`, `resolveTrick` and scoring calculation/application at base `716d4361ac1e45f6f504c49fb37917e44165dc2a`. Review establishes implemented mechanics; tests do not prove the strategic preferences optimal. No server/shared/runtime policy or model files changed. No dependencies added.

Reproduce the focused mechanics checks:

```sh
npx vitest run __tests__/CloseRungAceAndLastTurn.test.ts __tests__/NormalPlayRungReveal.test.ts __tests__/scoring.test.ts
```

Source quotations/hashes and structured privacy checks are automated. Human review remains necessary for prose accuracy, expert qualification and future transcript reconciliation. Narrative premises do not assert legal reachable snapshots.

## PR #5 final correction review

Retained the documented restricted schema interpreter without adding dependencies. Schema preflight now rejects unsupported or malformed constructs in all branches/definitions, and tests cover local references/siblings, oneOf overlap, nested required/additional/item checks, structural enum/const equality, Unicode lengths, finite numeric bounds, nulls and semantic guards against schema weakening. Total focused run: 56 tests across 4 files, passing. AI typecheck and knowledge CLI also passed after these corrections.

All six mechanics were independently re-read; [ENGINE_REVIEW.md](ENGINE_REVIEW.md) records paths, conditions and boundaries. One existing engine defect was reproduced: direct reveal requests omit advertised turn/void eligibility checks. The knowledge description is corrected; engine behavior is intentionally unchanged. A separate repair PR is needed for that defect.

PR #5 is ready for final review as a documentation/validation change, with that engine issue explicitly disclosed. It does not clear AI training or runtime promotion gates. Remaining provenance limits, incomplete narrative states and unanswered Scenario 21 are intentional and preserved.
