# AI correctness and learning repair

Original audit base: `b07dea61c43edb4b5390566361f4bb405c6414c9`; repair base:
`audit/ai-foundation-and-benchmarks` at `10075a4`. Original findings are preserved
in that branch/history. This document records their repair status and limits.

## Repaired confirmed findings

| Priority / IDs | Repair | Executable evidence |
| --- | --- | --- |
| Critical: INFO-01 | Separate authoritative and nullable visible records; opaque concealed slots; viewer private state; one transport boundary; no disclosure on unaccepted challenge surrender | `InformationBoundary.test.ts`, INFO-01 in `AIFoundationAudit.test.ts` |
| Critical: MC-01 | Randomized capacity matching preserves voids; infeasible worlds explicitly rejected | `WorldSampler.test.ts` (200 seeds), midgame randomized invariant test |
| Critical: MC-02 / MC-06 | Own locked card reserved; public and legitimately private owner cards pinned; hidden played slots counted separately | Corresponding audit regressions; complete 52-card accounting in `SimulationParity.test.ts` |
| Critical: MC-03 / MC-04 / MC-05 | Corrected rollouts execute authoritative engine methods: final trick, hidden trump, explicit reveal, same-opponent-player streak and first-trick exclusion | Original scenario regressions; 12 complete-game transition comparisons; explicit challenge, future Ace and streak tests |
| Critical: RL-02 | Actual pre-action to next-legal-decision transitions; authoritative hand termination; no rejected-action records or human-expert bonus | Audit regression plus `LearningLifecycle.test.ts` |
| Critical: RL-03 | Explicit internal room identity, per-room learner/replay, episode generations, cleanup on departure/new game; fix socket handler's stale main-room reference after joining another room | Explicit room callback regression; interleaved rooms and same-engine next-hand tests |
| Critical: NN-01 | Dueling mean derivative updates all advantage outputs; correct layer-normalization Jacobians | `NeuralGradients.test.ts`: 34 central-difference checks across all 12 parameter tensors; NN-01 regression |
| High: RL-01 | One feature-group definition drives vectorizer and default network dimensions | RL-01 regression; feature schema metadata |
| High: NN-02 | Complete architecture/dimension/finite-value/tensor/schema validation; hash-pinned legacy baseline only | NN-02, malformed checkpoint tests and `CheckpointSafety.test.ts` |
| High: unsafe training / persistence | Explicit new experimental output, atomic exclusive writes; no default/SIGINT overwrite; current engine phases; self-play uses its own learner; validated resume | Both trainer type checks; two-hand self-play/imitation jobs plus one-hand resume smoke |
| High: ambiguous controller priority | Explicit heuristic/legacy/corrected/neural-direct policy interface, no static-method monkey-patching; corrected live default; deterministic diagnostic fallback | Policy/benchmark tests and search counters |

All 12 former `it.fails` desired-invariant tests are now ordinary tests. None were
skipped or deleted to obtain a green run. Some old synthetic fixtures were
updated to supply the card/hand accounting the new strict sampler requires.
The old mutation test now uses a complete two-card endgame world; replay tests
explicitly account for defensive transition copies. The old small-network loss
test now actually constructs its intended four-output network instead of passing
a four-entry target to a 52-output default.

## Additional corrections found during repair

- **Seed 65 false void:** later flipping a caller's discard erased the distinction
  between no ordinary lead-suit card and a separate locked trump of that suit.
  Public play-time reveal provenance and shared tracker inference prevent this
  contradictory world. Seed 65 is a dedicated zero-fallback benchmark regression.
- **Challenge visibility:** public trump suit does not imply the face-down lead
  identity is visible. Acceptance reveals it; surrender does not. The serializer
  follows the explicit challenge modifier, including historical/no-play views.
- **Transport room reference:** joining a named room previously left event
  handlers bound to the main-room engine. The connection's current room is now
  updated, its prior player detached, and old learning cleaned up.
- **Replay/experience validation:** ring insertion copies transition arrays and
  masks; the learner rejects malformed dimensions, indices, nonfinite values and
  nonterminal empty masks. Replay capacities/sample sizes are validated.
- **Snapshot safety:** corrected reconstruction clones hands/cards, score state,
  votes, history and public setup metadata. It validates hand counts and duplicate
  identities and throws on missing concealed slots.

## Rules preserved and ambiguities isolated

The authoritative engine, not the UI prose, is the source of truth. No change was
made to its trick-winning, follow-suit, Ace, individual streak, final-trick,
modifier adjustment, dealer-transfer or KHOTI algorithms.

The UI describes center accumulation and other variants that `BaseRungEngine` /
`BundRungEngine` do not separately implement; gameType is mostly a label. This
repair does not invent collection or bidding-variant rules. Simulations reproduce
the existing engine's counters and accumulated face-down card lifecycle.

The engine's request-reveal method itself allows some requests broader than the
private `canRequestRungReveal` permission. Controllers use that permission and
preserve the method's existing gameplay behavior. No extra reveal permission was
introduced. First-trick exclusion and caller-team ineligibility for an early
Bund win remain exactly as implemented, even if broader prose suggests otherwise.

Surrender clears a challenge's display flag without explicitly flipping its card,
whereas acceptance explicitly flips it. The serializer conservatively keeps the
unaccepted identity concealed; scoring/termination are unchanged. Historical
caller cards become visible after actual trump reveal, even when an old internal
face-down flag was retained. These are disclosure-boundary corrections, not new
card-play rules.

## Mathematical and learning verification

Finite-difference tests use fixed seed 731, a small 3/5/4/3/3/4 network, delta-1
Huber targets inside and outside the quadratic region, step 1e-3 and tolerance
`3e-3 + .02 * |numerical gradient|` for Float32 rounding/normalization. Both ends
and middle of every tensor are checked (34 distinct locations). Dueling and
normalization derivatives are tested together; serialized forward output remains
compatible with validated weights.

Transitions use actor-next-decision boundaries, explicit terminal observations,
authoritative winners and legal next masks. Configurable shaping defaults off.
Live training is per-room and in memory; off-policy human actions are ordinary
outcome experience, not imitation labels. Imitation's teacher is explicitly the
heuristic policy, not assumed expert humans or a model-strength oracle.

Short jobs executed without touching the canonical checkpoint:

| Job | Completed / aborted | Decisions | Updates |
| --- | --- | ---: | ---: |
| Self-play: seeds 1–2, batch 4 | 2 / 0 | 104 learner-selected | 25 minibatches |
| Imitation: seeds 1–2 | 2 / 0 | 36 legal teacher actions | 36 gradient steps |
| Validated resume: seed 3, epsilon 0, batch 4 | 1 / 0 | 52 learner-selected | 12 minibatches |

Checkpoint outputs were new files under `/tmp`; neither script ran prolonged
training. No stronger-model claim or production promotion follows.

## Remaining limitations (explicitly unresolved)

1. The **legacy evaluation policy intentionally retains the old planner defects**
   for comparison. It is not the live default. Its zero reported errors do not
   certify its worlds or rules; that implementation never validated them.
2. Constrained matching is randomized, not uniform. A simple unconstrained
   1,000-seed ownership probe assigned S_A to p1/p2/p3 346/335/319 times; this is a
   sanity measurement, not proof of unbiased constrained posterior sampling.
   Bidding-conditioned probabilities are not modeled.
3. Rollout continuation is greedy and ends at one hand. Engine scoring, transfer
   and actual KHOTI are exact; optimal multi-hand continuation after transfer is
   not solved. The +/-1000 match utility and tactical candidate pruning are
   explicit evaluation choices, not new authoritative rules.
4. Decision deadlines are cooperative between complete comparisons, not hard
   preemption. Bounded iterations/graph/transition counts prevent indefinite
   search, but individual comparisons or GC can exceed 25 ms. Worker isolation
   and hard real-time latency remain future work.
5. Neural-direct remains evaluation-only. The legacy baseline model was trained
   with the old defects; correcting code does not repair its existing weights.
   There is no automatic checkpoint promotion.
6. Coverage establishes tested reconstruction/rule parity, not a formal proof for
   every possible server state. Browser/audio/UI redesign, other game variants,
   adversarial networking and a full multi-hand match tournament are out of scope.
7. Only 200 paired deals per comparison were run; a 1,000-pair tournament was not
   run. The suite reused diagnostic seeds, including the seed-65 repair, so its
   confidence intervals are not held-out general-strength guarantees.

No known critical/high-priority original audit defect remains in the corrected
path. The retained legacy path and limitations above must stay visible in review.
See `AI_BENCHMARKS.md` and the committed machine-readable comparison for results,
commands, confidence intervals and latency evidence.
