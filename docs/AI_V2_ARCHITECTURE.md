# AI v2 architecture and rule inventory

Contract: [CODEX_AI_V2_IMPLEMENTATION.md](CODEX_AI_V2_IMPLEMENTATION.md). The authoritative engine and scoring matrix remain unchanged. Corrected-search remains the live default. New code is an opt-in experiment.

## Compact simulation boundary and invariants

Setup, bidding, hidden trump selection and initial face-down declarations remain authoritative `BotPlayer`/engine actions. The compact adapter starts at a legitimate `TRICK_PLAYING` observation plus a constraint-valid proposed world; it does not invent bids or reinterpret pre-deal states. It validates once, maps canonical cards to 0–51, separates the locked slot and copies each hand into a Uint8Array. Explicit clones copy mutable hands, plays, votes and counters; immutable source metadata/history objects are shared without mutation. No JSON cloning or engine reconstruction occurs in simulated transitions. Terminal scoring calls the unchanged `ScoringEngine` once.

Representation benchmark `scripts/benchmark-v2-cards.ts` compares BigInt, two Uint32 words and typed-array membership/toggling. Typed arrays were chosen for cheap small-hand iteration and slice cloning; the microbenchmark is not a game-throughput claim.

Rule inventory:

| Domain | Compact state / transition | Differential checks |
| --- | --- | --- |
| Held vs locked card | Ordinary hand arrays, separate locked index; revealed or caller's last card unlocks | Exact per-seat legal cards and counts |
| Follow suit | Must follow available lead suit, including playable locked card | Every transition, all seats |
| Hidden trump | No superiority until explicit reveal; caller off-suit plays concealed | Card visibility, flags, legal actions, winner |
| Reveal | Opponent void request, caller show, compulsory revealer trump, pending/pause/resume | Private eligibility, actor and legal sets |
| Face-down challenge | Per-defender votes; matching accept/surrender; mode-specific modifiers | Targeted Open/Bwinji vote and score fixtures |
| Accumulated discards | Retained concealed records, flip and clear on proper subsequent play | Reachable concealed play plus reveal transitions |
| Trick outcome | Lead/trump comparison, downgraded Ace power, ties retain earlier play | Current and historical plays/winners |
| Early Bund | Same individual opponent of caller, revealed, tricks 2+, two consecutive wins | Per-player streak, phase and terminal result |
| Ace downgrade | Previous winning card Ace and same winner leads Ace on trick 2+ | Targeted fixture plus seeded occurrences |
| Final trick | Winner of trick 13, not majority | Terminal winners and official scores |
| Scoring | Existing mode/modifier matrix, dealer-relative adjustment, transfer, KHOTI | Complete scorecard, dealer and match winner |

UI status strings, toss animations and bidding menus are not reconstructed in the compact hot loop; they do not influence simulated legal play. The source observation is retained for immutable game/team/scoring metadata. No new compact state crosses Socket.IO.

The parity suite checks 400 seeded random-play games (18,664 transitions, including mid-trick rehydration) plus targeted rare states. This is a regression gate, not a proof of all possible states. A mismatch blocks search use during validation; runtime errors must route to the authoritative corrected planner, never approximate a failed rule.

## Beliefs

`BeliefState` is decision-local and separates known plays/voids from `ParticleSampler` probabilities. The existing matching sampler preserves counts, disclosures, remembered concealed plays and locked ownership. No strategic failure to overtake becomes a hard void or ownership assertion. Proposal samples are not uniform over feasible deals.

Optional `OpponentLikelihood` reconstructs hypothetical earlier holdings from a proposed remaining world and subsequent observed plays, then applies a deliberately weak low-rank behavior model mixed with uniform play. Every action keeps positive likelihood. Log normalization avoids underflow; ESS, unique proposals, impoverishment and systematic resampling are reported. No unweighted rejuvenation silently changes the posterior. Weighted beliefs are off by default until calibration and strength evidence support them. Calibration separately reports generating-policy mismatch (random versus low-card play), Brier/log loss, diversity, violations and sampling time. These are diagnostic estimates, not a validated human-opponent model.

## Search information sets and controller

The implementation uses **single-observer ISMCTS**, not omniscient multiplayer UCT. Only the root observer's turns enter the tree. Keys contain that observer's remaining hand, legitimately known lock/secret, visible/remembered action history, lead/reveal and public streak state. Other actors use an observation-only continuation whose input contains their own hypothetical hand and public/own remembered plays, never other players' sampled hands. The same observation yields the same opponent choice. This explicitly modeled-opponent method avoids giving opponent tree policies the root's private cards; it does not claim RIS-MCTS re-determinization or eliminate root-determinization strategy fusion/nonlocality.

Each node has action visits, value sums and **availability** counts. UCT considers only actions legal in that sampled state. Complete terminal simulations commit the entire path's visits/availability/value atomically; a deadline commits none of an interrupted path. A transition failure aborts the decision rather than censoring a difficult world. Root value uses authoritative signed hand/match utility divided by its known maximum magnitude (1,208); there is no per-trick reward. A decision-local empirical pool defaults to 16 worlds, 64 maximum simulations and 512 nodes. Explicit RNG callbacks are used without replacing global Math.random.

The cheap rollout conserves a closed, safe partner winner unless an eligible personal streak matters, otherwise tries an inexpensive winning card before conserving low cards. It is a deliberately cheaper counterpart of the Phase 2 partnership heuristic, not the identical probabilistic continuation. Phase 2 root estimates inform the adaptive controller. Ablations disable partnership or adaptation independently. This opponent model can be exploited and is a source of evaluation bias.

`DecisionController` routes sole legal actions, closed safe-partner opportunities, public exact endgames and uncertain positions. Estimated uncertainty from the root probability gap and legal branching scales the simulation cap; this is a heuristic value-of-computation estimate, not a learned optimal allocation. Exact endgames reuse Phase 2's strict publicly known ownership gate and team minimax. Node/work limits complement the total 25 ms soft deadline. Internal/parity failures call the existing corrected-search tactical path with the remaining budget; an exhausted budget uses its bounded candidate-order fallback. The room queue and public Socket.IO contracts are unchanged.

## Experimental learning

`v2-learning.ts capture` records only root observation features, a legal action mask, normalized completed search visits and the eventual authoritative team hand/match reward. Aborted hands produce no training dataset. Forced/obvious decisions without completed search visits are excluded; this selection bias is explicit. Each sample records its seed; the dataset records feature version and an explicitly supplied teacher commit. Hidden referee holdings are never features.

The isolated 144-feature schema encodes own held/locked cards, publicly visible plays, own remembered active concealed plays, lead/revealed trump, the caller's private secret only for its owner, hand counts and public streak/scoring context. Policy indices use the compact canonical card ordering. This schema is intentionally separate from the canonical neural checkpoint's legacy schema.

A dependency-free linear softmax policy and tanh value head provide a small supervised baseline. Training uses legal masked visit cross-entropy and terminal value MSE with deterministic initialization/order. It is experimental because development search evidence does not establish a stronger teacher. Policy-only inference and root policy-prior-guided ISMCTS are evaluated independently. The value head is trained and evaluated but **does not truncate terminal rollouts or bootstrap search**: calibration/strength evidence does not justify that shortcut yet.

Checkpoint paths are restricted to `server/ai/models/experiments/v2/`, with symlink traversal rejected, strict schema/dimensions/finite bounds, payload hashes, and temporary-file atomic rename. Resume validates before training. Canonical checkpoint writes are prohibited by path, not merely a warning. Experimental outputs are ignored by git; summaries, hashes and reproduction commands are retained.

## Frozen protocol

Default search parameters: 64 maximum iterations, 16 fresh proposal particles per decision, 512 nodes, sqrt(2) UCT exploration, observation-only partnership continuation, adaptive routing, public exact solver, unweighted beliefs. Initial fixed-work smoke seeds 10000–10049; development 11000–11199. Ablations use 11000–11049; Phase 2 comparison uses 12000–12049. Matched 25 ms comparisons use 13000–13199. **Fresh final held-out seeds 700000–700999**, disjoint from Phase 2's held-out set and all development/training seeds. Parameters are not tuned after inspecting final outcomes. Teacher training uses 400000–400007; validation uses 400100+; neural evaluation uses 14000+. Complete-match diagnostics use 15000+. Results are reported separately, not pooled to manufacture significance.
