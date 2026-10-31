# AI foundation audit

Scope: base `b07dea61c43edb4b5390566361f4bb405c6414c9`.
No policy/rule fixes are bundled. No model was trained or overwritten. Ranked
findings below distinguish reproducible bugs from weaknesses and hypotheses.

## Reproduce the evidence

```sh
npx vitest run __tests__/AIFoundationAudit.test.ts __tests__/AIBenchmark.test.ts
npx tsc --noEmit
npm run typecheck:ai
```

`AIFoundationAudit.test.ts` uses ordinary passing invariant/characterization tests
and explicitly named `it.fails` tests for **unresolved defects**. An expected
failure is a failing desired correctness assertion, not verified correct behavior.
If a fix makes one pass, Vitest fails the suite as an unexpected success: remove
`.fails` with the fix. This avoids changing gameplay to make an audit green.
Synthetic small-hand fixtures isolate the planner/engine differences; normal
seeded full-deal tests exercise the actual phase driver separately.

## Ranked confirmed defects

| Rank | ID / priority | Finding and reproducible evidence | Consequence / next correction |
| --- | --- | --- | --- |
| 1 | INFO-01 / P1 | `getPublicState` serializes actual `card` objects for unrevealed `currentTrick`, `completedTricks`, previous tricks and `faceDownCallerCards`. `getClientGameState('p1')` exposes `D_5` face-down from p0; INFO-01 expected failure. Trackers/vectorizer read `pc.card` regardless of hidden status. | Hidden-card identity leak biases decisions and reaches clients. Define and test viewer-specific redaction before changing public types or Socket.IO payloads. No contract change in this PR. |
| 2 | MC-03, MC-05 / P1 | Rollouts award same-team consecutive tricks and use >=7 trick majority; authoritative `resolveTrick` requires the **same opponent player**, after reveal, with trick 1 excluded, and final trick decides otherwise. MC-03: T1 has 10 previous tricks but loses trick 13: engine T2, rollout positive for T1. MC-05: p1 wins trick 1, teammate p3 wins trick 2: engine continues, rollout returns -150. | Candidate utilities optimize different rules. Reuse or parity-test authoritative transitions before trusting planner strength. |
| 3 | MC-04 / P1 | Secret suit is passed as active trump even while hidden; rollout treats an off-suit S_K as beating H_A. With 6:6 previous totals, engine T2, rollout positive for T1. It also auto-reveals if a simulated trick contains that suit, unlike engine explicit reveal. | Caller simulations can predict impossible wins and reveal timing. Model explicit reveal/locked-card state. |
| 4 | RL-02 / P1 | Live experience uses `nextState: item.stateVector`; terminal flag only checks match over or 13 completed tricks. RL-02 completes an ordinary final game and finds original state references and nonterminal GAME_RESOLVED records. | Corrupted Bellman targets. Capture actual next decision state per actor and distinguish game versus match termination. |
| 5 | RL-03 / P1 | Bot hooks use `(engine as any).roomId || 'main_room'`, while engine has no roomId and server never assigns it. RL-03 drives two engine instances and records identical room IDs. Human hooks use real `room.id`. | Bot histories from separate rooms mix with main-room events; other rooms' human and bot histories split. Pass an explicit room context through a compatible internal API. |
| 6 | MC-01 / P1 | Feasible three-card assignment with p1 void in hearts/clubs and needing one spade: greedy sampling may give the spade elsewhere and fallback assigns p1 a forbidden suit. Seeds 0–19 reproduce. | “Consistent” worlds contradict observations. Use constraint-preserving assignment/rejection with explicit infeasibility handling. |
| 7 | MC-02, MC-06 / P1 | Locked own S_A is not included when default private hand is passed, so generator assigns it to someone else; known shown S_A is not pinned to p1. Tests exercise each. | Worlds have incorrect ownership/omitted actual cards despite unique generated IDs. Track own locked card and public fixed ownership separately from unknown pool. |
| 8 | NN-01 / P1 | For one masked target, unselected advantage outputs get zero gradient. Correct derivative of `-mean(A)` is `-sum(dQ)/52` on **all** outputs. NN-01 observes unchanged unselected `b_adv2[1]`. | Wrong gradient changes learned function; repair with numerical-gradient checks before retraining. |
| 9 | RL-01 / P2 | Fresh learner has 241 inputs; vectorizer and current model have 245. RL-01 compares dimensions. | Fresh RL silently ignores four input features. Existing compatible-model resume uses 245 and avoids this dimension mismatch. |
| 10 | NN-02 / P2 | `fromJSON({inputSize:245,w_shared1:[0]})` succeeds, leaving unspecified values randomly initialized. NN-02 expects rejection. | Invalid checkpoints can become partly random models. Validate complete shapes, finite values, output dimension and feature schema. |

The normal neural bypass is a **confirmed control-flow fact**, not proof that a
neural-first controller would be stronger. The spy test verifies successful MC
never invokes `ModelManager.getModel`; exception fallback does. Decide controller
intent after measuring; do not reorder it to claim sophistication.

## Monte Carlo verification matrix

| Requirement | Finding |
| --- | --- |
| Known voids and exact counts | Unconstrained 13-card hands/counts pass. Void fallback fails MC-01. Greedy counts are capped but not validated for infeasible/mismatched inputs. |
| No duplicates of known/played cards | Visible played IDs and supplied own-hand IDs are excluded; generated IDs unique in tested full deck. Locked own trump and known ownership fail MC-02/06. Other players' locked trump has no distinct reserved slot. |
| No opponent secret access | No direct engine-hand reads in generator; independence test changes hidden storage with fixed public state/RNG. Public face-down identity leak fails INFO-01. |
| Authoritative trick resolution | Ordinary lead/trump comparison is similar and initial candidate Ace downgrade passes a focused parity case. Terminal/streak/reveal cases fail MC-03/04/05. No comprehensive rule equivalence claim. |
| Hidden trump and reveal | Hidden suit used with immediate trump superiority; implicit auto-reveal; no reveal requester, reveal obligation, pause, or locked-card release transitions. Secret suit parameter to world generation is unused. |
| Accumulated tricks/cards | Aggregate counts start from public totals, but utility uses incorrect majority rule. Completed/face-down history is reduced to known-card exclusion and inferred voids; accumulated hidden-card reveal lifecycle is not simulated. |
| Ace downgrade | Candidate checks last winning Ace, but omits leading/trick-number guard. All later rollout cards hard-code `isAceDowngraded:false`, and `lastWinnerPlayerId` is assigned without maintaining a last winning card. Future lead Aces therefore miss the rule (code-confirmed; initial candidate tested, later-step differential test remains to add). |
| Scoring | Utility is +/-150 for simulated Bund, or +/-50 plus trick margin. It never calls `ScoringEngine`, represents modifiers, dealer transfer, KHOTI thresholds or cumulative match scoring. Code-confirmed limitation; existing scoring tests validate engine only. |
| Live-state mutation | Current rollout arrays copied; invariant test checks public state, own and sampled hands unchanged. No live writes observed. Shared card references remain an API fragility. |
| Comparable candidate worlds | Pass: one generated map per iteration is used for every candidate. Rollout shedding currently deterministic; it does not re-sample per card. Tie breaks preserve input candidate order. |

Rollout also creates a dummy H_2 when a simulated hand is empty and stops when
**any** hand empties. With unequal/missing locked-card counts, this can conceal
invalid worlds or terminate before remaining cards are played. No input
consistency validator exists. These code paths are identified, but their
frequency/strength effect in live games is unmeasured.

## Reinforcement-learning review

- **Transitions and masks:** self-play closes a previous actor transition at that
  actor's next turn, a better boundary than live learning's pre-state reuse.
  Live learning gathers next legal masks just after a trick, when only its next
  leader can act; other actors' empty masks suppress bootstrapping prematurely.
  `ReinforcementLearner` itself correctly honors provided next-action masks and
  `done`; the focused Bellman test verifies both. Caller legal IDs are mapped
  through hand/trump; missing IDs silently map to action 0 in trainers/live hooks.
- **Reward attribution:** live rewards are +1 winner, +.8 partner, -1 opponent,
  with +.5 for human winners, regardless of game/score value. A human winner is
  not evidence of an optimal demonstration. Self-play adds team-streak bonuses,
  caller trump penalties and Ace bonuses that encode heuristics, not the actual
  objective. Its final winner is trick majority instead of
  `lastGameWinningTeam`, including prematurely exited games. This can train
  against authoritative outcomes. It does not measure a real match win.
- **Terminal handling:** live flags ignore early GAME_RESOLVED hands; history
  count persists across games even though completedTricks resets. The next hand
  can accumulate events until its trick count exceeds the previous hand's count.
  Hooks capture before validation: a rejected play can leave a pending sample.
  These are direct code-path findings; only the pre-state/terminal and room-mix
  cases have executable regression cases here. Abort/removal cleanup is absent.
- **Replay:** ring eviction and with-replacement sampling pass focused tests.
  Transition references are mutable, no range/dimension/finite validation, no
  room/episode IDs or per-policy metadata. These are limitations, not evidence
  the ring's indexing is broken.
- **Gradients:** dueling mean gradient is confirmed incorrect (NN-01).
  Shared-layer backprop also omits layer-normalization derivatives: it applies
  leaky-ReLU gradients directly to shared affine layers. This is code-confirmed
  mathematical mismatch; finite-difference coverage remains outstanding. The
  returned “loss” is squared error, whereas updates use clipped Huber gradients,
  so logs are not the actual optimized loss. Training-loss decline alone cannot
  establish policy strength.
- **Compatibility:** current JSON 245x52 loads and serialization/forward parity
  passes on a small network. No feature-layout version exists, so same-length
  incompatible representations cannot be rejected. Input-size check alone does
  not establish full checkpoint validity. Existing cached-model error fallback
  may mask incompatible or corrupt disk state.
- **Persistence:** both scripts save the tracked model periodically, on completion
  and on SIGINT. Imitation starts a **fresh** model rather than resuming, so even
  an immediately interrupted invocation can replace existing weights. No trainer
  was executed in this audit. Live learning also saves at match completion, with
  shared static learner state, no tournament gate and no atomic checkpoint write.
- **Training control:** self-play's normal exploitation calls the teacher, not its
  own online learner. Imitation intentionally never lets student predictions
  choose actions. Live neural selection is a planner-error fallback. None of the
  advertised training progress metrics demonstrates that the resulting model is
  controlling or improving live decisions.
- **Trainer execution gaps:** `train_ai.ts` uses the `Card` type without importing
  it, hidden by tsconfig excluding scripts. Explicit trainer type-checking also
  finds both scripts call nonexistent `dealerDistributeRemainingCards`, and
  self-play reads nonexistent `publicState.secretTrumpSuit`. These existing
  trainer compile errors are documented rather than changing their behavior. Training loops can break on zero
  legal actions while pending reveal belongs to a different player, and omit
  face-down challenge handling. They still tally/save after breaking. Do not run
  them against the canonical checkpoint before adding abort checks, explicit
  output paths and protected evaluation.

## Design weaknesses and unverified hypotheses

**Design weaknesses:** greedy determinization is not a uniform constrained-world
sampler; rollouts are deterministic greedy play rather than adversarial search;
100 worlds is fixed regardless of candidate count/remaining tricks; errors are
silently swallowed; neural features omit scoring and some locked-card concepts;
training mixes reward scales without policy provenance. These facts do not alone
prove a specific win-rate loss.

**Unverified hypotheses:** more rollouts, belief weighting, richer features,
neural-first action ordering or different network size might help. No claim of
causal strength improvement follows from this audit. The small benchmark is a
starting measurement, not a ranking of human or tournament skill. No evidence
supports the trainer's “85th+ percentile” claim.

Recommended order: correct hidden-information boundary; establish engine/rollout
parity and constrained worlds; repair transition/gradient/model validation;
separate checkpoint outputs and promotion; then compare candidates on more paired
seeds and held-out scenarios. Keep each behavior fix separately reviewable.
