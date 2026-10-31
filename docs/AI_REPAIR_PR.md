# Repair Bund Rung AI information, simulation and learning correctness

Base: `audit/ai-foundation-and-benchmarks` (PR #1).
Head: `fix/ai-correctness-and-learning`.
Do not merge PR #1 or this branch automatically.

The previous audit found public hidden-card exposure, invalid sampled worlds,
rollout rules that differed from the engine, corrupted learning transitions and
incorrect neural gradients. This change repairs the foundation before attempting
new strategy or model promotion.

## Changes and confirmed repairs

- **INFO-01:** nullable concealed records, opaque placeholders and viewer private
  information, routed through one `gameStateUpdated` transport boundary. Update
  shared consumers with null guards; no frontend redesign or event-name changes.
- **MC-01 / MC-02 / MC-06:** exact-capacity randomized matching, fixed ownership,
  locked trump and concealed played slots; contradictions rejected explicitly.
- **MC-03 / MC-04 / MC-05:** corrected simulations reconstruct an independent
  authoritative engine from sanitized observations and sampled worlds. Actual
  engine methods handle follow suit, explicit reveal, caller obligations,
  individual/first-trick streaks, final trick, future Ace downgrades, modifiers,
  dealer-relative scoring and KHOTI. No dummy cards or guessed majority result.
- **RL-02 / RL-03:** explicit room/episode identity; successful action to the same
  actor's next legal decision or actual hand terminal; rejected actions and
  departures cannot pollute pending histories. Per-room replay/learning; no human
  expert bonus or automatic canonical writes. Fix the server's stale main-room
  handler reference after joining a different room.
- **NN-01 / RL-01 / NN-02:** correct dueling mean and layer-normalization
  derivatives, actual Huber loss, one feature-count/schema definition, complete
  finite tensor/dimension/version validation, hash-pinned legacy baseline only.
- Protect checkpoints with explicit new experimental destinations and atomic
  exclusive writes. Self-play exploits the learner being updated; imitation is
  separate, legal teacher labeling. Both trainers compile, handle current phases
  and refuse to report aborted games as completed training.
- Explicit `heuristic`, `production-legacy`, `corrected-search` and
  `neural-direct` policies replace benchmark method monkey-patching. Corrected
  search is the live default with bounded rollout work and deterministic legal
  fallback plus structured reason codes. Neural-direct stays evaluation-only.

Additional regression evidence: seed 65 exposed a false void when a caller's
pre-reveal discard was later flipped while its separately locked trump remained.
Public reveal-at-play provenance fixes that inference. Publicly shown ordinary
cards also cannot be sampled as an unknown locked slot.

## Reproducible evidence

```sh
npx tsc --noEmit
npm run typecheck:ai
npm test
npm run build
```

Both TypeScript checks pass, including every trainer. All **162 ordinary tests
across 16 files pass**; no expected failures, skipped tests or weakened assertions.
The 12 former expected-failure audit IDs are now ordinary regressions. Existing
engine/scoring/tactical suites pass. Production build passes with the existing
nonfatal large-chunk warning.

Coverage includes information and transport isolation; hard world constraints
across randomized seeds; 12 complete seeded engine/reconstruction games with
transition equality; challenge accept/surrender; nonzero scorecard cloning and
all modifier combinations; individual streaks and future Ace downgrade; rejected
learning actions; interleaved rooms and consecutive hands; checkpoint rejection
and preservation; deterministic benchmark replay and bounded legacy budgets.

Finite-difference tests cover 34 representative entries across every weight/bias
tensor, fixed seed, step 1e-3, tolerance 3e-3 + 2% relative for Float32 arithmetic.
Both quadratic and clipped Huber regions are exercised. Declining loss is not
used as evidence of correct gradients.

Smoke training only: self-play 2 hands / 104 actions / 25 minibatches; imitation
2 hands / 36 legal labels and updates; validated resume 1 hand / 52 actions / 12
minibatches. All completed without aborts and wrote new `/tmp` files only.

## Benchmark comparison

200 paired deals per comparison, seeds 1–200, both candidate team assignments,
identical heuristic setup and forced reveal/challenge controls. Corrected search
uses 16 engine worlds; legacy uses its original 100 approximate worlds. Budgets
are not claimed computationally equivalent. All policies use the repaired
information boundary, so these are not pre-repair leaked-information reruns.

| Candidate vs baseline | Wins–losses | Signed hand points | Paired win-rate 95% CI |
| --- | --- | ---: | --- |
| corrected-search vs heuristic | 201–199 | +39 | 47.50–52.75% |
| production-legacy vs heuristic | 188–212 | -117 | 44.25–49.75% |
| corrected-search vs production-legacy | 212–188 | +585 | 50.50–55.75% |

All **1,200 hands completed with zero invalid moves or aborted games**. Corrected
search reported zero sampling failures, zero fallbacks and zero neural inferences
in both runs. Legacy's absence of thrown errors is not proof of valid worlds.
Intervals use 5,000 paired-deal bootstrap resamples; seeds include diagnostic
cases used during repair and are not a held-out strength test.

Head-to-head card latency mean/p95/max: corrected 8.846/63.036/259.093 ms; legacy
5.768/40.544/427.377 ms. Offline comparisons used deterministic world budgets,
not the default live soft 25 ms cutoff. Reveal latency/counts, complete per-hand
outcomes and other run timings are in `benchmarks/ai-repair-comparison.json` and
`docs/AI_BENCHMARKS.md`. Raw per-action CLI JSON remains in this session's `/tmp`
files documented there. No general AI strength or stronger-model claim follows.

Canonical model checksum before/after all validation and training:

`66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`

The trained model, dependency lockfile and dependency declarations remain
unchanged. Network/security settings were not modified.

## Design limitations and unverified hypotheses

- Legacy intentionally keeps the old rule defects for evaluation, not live use.
- Randomized matching is constraint-correct, not proven uniform; bidding
  posteriors and optimal continuation are not modeled.
- Corrected rollouts use greedy continuation through one hand, exact engine
  scoring and an explicit terminal-match utility bonus; future hands are not
  searched. Tactical pruning still limits the candidate set.
- The live deadline is cooperative, not hard worker-thread preemption; one
  complete comparison or GC pause can exceed 25 ms. Computation is bounded.
- UI accumulation/variant prose differs from current engine behavior. Preserve
  the engine's implemented rules; do not silently invent variant mechanics.
- A 1,000-pair comparison, full multi-hand match tournament and browser/audio
  testing were not run. Hard latency bounds and broader playing strength remain
  unverified. No experimental checkpoint was promoted.

Recommend correctness review against the audit branch, with particular attention
to the intentional nullable-card wire contract, soft latency budget and rollout
utility. Review production latency separately before rollout. No automatic merge
or neural checkpoint promotion is requested.

## Changed files
- `__tests__/AIBenchmark.test.ts`
- `__tests__/AIFoundationAudit.test.ts`
- `__tests__/CheckpointSafety.test.ts`
- `__tests__/InformationBoundary.test.ts`
- `__tests__/LearningLifecycle.test.ts`
- `__tests__/NeuralAI.test.ts`
- `__tests__/NeuralGradients.test.ts`
- `__tests__/NormalPlayRungReveal.test.ts`
- `__tests__/SimulationParity.test.ts`
- `__tests__/WorldSampler.test.ts`
- `__tests__/engine.test.ts`
- `benchmarks/ai-repair-comparison.json`
- `docs/AI_ARCHITECTURE.md`
- `docs/AI_AUDIT.md`
- `docs/AI_BENCHMARKS.md`
- `docs/AI_REPAIR_PR.md`
- `package.json`
- `scripts/ai-benchmark.ts`
- `scripts/ai-training.ts`
- `scripts/train_ai.ts`
- `scripts/train_expert_imitation.ts`
- `server/ai/BotPlayer.ts`
- `server/ai/DecisionPolicy.ts`
- `server/ai/neural/FeatureSchema.ts`
- `server/ai/neural/LiveLearningEngine.ts`
- `server/ai/neural/ModelManager.ts`
- `server/ai/neural/NeuralNetwork.ts`
- `server/ai/neural/ReinforcementLearner.ts`
- `server/ai/neural/ReplayBuffer.ts`
- `server/ai/neural/StateVectorizer.ts`
- `server/ai/planning/CardTracker.ts`
- `server/ai/planning/LegacyMonteCarloPlanner.ts`
- `server/ai/planning/MonteCarloPlanner.ts`
- `server/ai/planning/WorldSampler.ts`
- `server/engine/BundRungEngine.ts`
- `server/engine/ScoringEngine.ts`
- `server/engine/SimulationWorld.ts`
- `server/server.ts`
- `server/transport/GameState.ts`
- `shared/types.ts`
- `shared/visibility.ts`
- `src/components/TableLayout.tsx`
- `tsconfig.ai.json`
