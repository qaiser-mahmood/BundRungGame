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
