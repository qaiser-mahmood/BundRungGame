# Focused validation record

No training, self-play, tournament, production build or full integration suite was run for this documentation-focused change.

| Check | Result |
| --- | --- |
| `npm run validate:expert-knowledge` | Pass: schema 1.0.0; 28 principles, 20 narrative scenarios, 6 corrections; zero training examples |
| `npx vitest run __tests__/ExpertKnowledge.test.ts` | 13/13 pass |
| Focused existing Ace/last-turn, normal reveal and scoring tests | 34/34 pass across 3 files |
| `npm run typecheck:ai` | Pass |
| Canonical checkpoint SHA256 | `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`, unchanged |

Engine review covered `submitBid`, `getLegalCardsForPlayer`, `playCard`, `getRevealPermissions`, `resolveTrick` and scoring calculation/application at base `716d4361ac1e45f6f504c49fb37917e44165dc2a`. Review establishes implemented mechanics; tests do not prove the strategic preferences optimal. No server/shared/runtime policy or model files changed. No dependencies added.

Reproduce the focused mechanics checks:

```sh
npx vitest run __tests__/CloseRungAceAndLastTurn.test.ts __tests__/NormalPlayRungReveal.test.ts __tests__/scoring.test.ts
```

Source quotations/hashes and structured privacy checks are automated. Human review remains necessary for prose accuracy, expert qualification and future transcript reconciliation. Narrative premises do not assert legal reachable snapshots.
