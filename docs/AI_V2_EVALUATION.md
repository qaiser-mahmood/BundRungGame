# AI v2 implementation and evaluation

## Recommendation

Keep PR #3 **draft**, retain `corrected-search` as production default, and review v2 as an experimental policy. V2 shows a modest statistically positive **fixed-work** result, not a demonstrated production-budget improvement. It misses the preferred 55% win target, matched-time evidence is inconclusive, and average computation/queued waiting increases. No merge or default promotion is performed.

## Implementation and scope

| Component | Delivered | Deliberate limits |
| --- | --- | --- |
| Compact simulator | Uint8Array hands, explicit clones, indexed cards, legal/forced actions, concealment/reveal/challenge, Ace/streak/final trick, authoritative scoring | Starts after authoritative bidding/declaration; does not duplicate setup/dealing/UI |
| Differential gate | Every transition in 400 reachable seeded games; mid-trick rehydration; targeted challenge, Ace, KHOTI and terminal fixtures | Representative coverage, not exhaustive proof |
| Beliefs | Hard matching constraints, optional soft action likelihood, stable log weights, ESS, diversity/impoverishment, systematic resampling | Non-uniform matching prior; weak low-card behavior model; fresh decision-local proposals rather than persistent opponent profiles |
| Search | Single-observer ISMCTS, information-set keys, legal availability UCT, atomic completed paths, node/work/deadline caps, local RNG | Explicit modeled-opponent method, not RIS-MCTS; residual strategy fusion/nonlocality; small empirical world pool |
| Hybrid/endgame | Cheap shared forced boundary, conditional obvious actions, uncertainty/branching allocation, public-only exact minimax, corrected-search fallback | Heuristic value-of-computation; exact eligibility deliberately strict and unused in ordinary tournament games |
| Learning | Observation schema, legal masks, visit targets, terminal rewards, reproducible linear policy/value imitation, isolated atomic hashed checkpoints, resume, policy-only/root-prior modes | Tiny experimental teacher dataset; **value head is not used to bootstrap/truncate search** because validation is poor |
| Integration | Server-controlled `ai-v2-ismcts` opt-in, existing room queue, benchmark scripts | No unauthenticated client policy selection; no canonical checkpoint replacement |

The authoritative engine, scoring matrix, Socket.IO contracts, existing policies and production default are unchanged. Existing canonical neural checkpoint remains 245 inputs/52 outputs; the new isolated schema is incompatible by design. See [AI_V2_ARCHITECTURE.md](AI_V2_ARCHITECTURE.md) for the rule inventory and information boundaries.

## Versions, protocol and gates

Starting branch commit: `4d3ee0f` (contract on Phase 2 `ad523dd`). Default search parameters frozen at `2c166275e04a53ad9a4759ab9184c346b5fecb0f`: maximum 64 simulations, 16 proposals, 512 nodes, sqrt(2) UCT, partnership continuation, adaptive routing, public exact solver, **unweighted** beliefs. Subsequent optional learning and diagnostic additions do not alter default fixed-work decisions. Node `v24.19.0`; no new dependencies.

- `npm ci --cache /tmp/bundrung-npm-cache`: passed (299 locked packages). Initial sandbox/cache installation failed; retry with a writable cache succeeded.
- `npx tsc --noEmit` and `npm run typecheck:ai`: passed.
- `npm test`: **230 tests across 25 files passed**, including existing privacy, learning and socket tests.
- `npm run build`: passed; pre-existing Vite >500 kB chunk warning remains.
- `npm run benchmark:tactics`: **14/14** passed; not evidence of match strength.
- `npm run test:parity`: passed. The representative probe covers **18,664 transitions**, **1,963 mid-trick reconstructions**, **366 reveals**, 400 completed hands and seeded Ace/concealed-play occurrences. Targeted tests include Open/Bwinji accept/surrender, KHOTI utility, exact endgame routing and a last-two-trick sacrifice.

Parity compares legal cards for every seat, actor, dealer, phase, reveal eligibility, remaining counts, current/historical card visibility and flags, accumulated records, winners/streaks, complete official scorecard and match winner. A targeted test caught and fixed a compact Bwinji surrender modifier-precedence discrepancy **before** search integration. No authoritative rule changed.

Tests also cover real hidden-storage swaps with identical observations/decisions, independent particle pools, stable weights and extreme-weight resampling, deterministic search, interrupted paths committing no statistics, node caps, legal fallback to corrected-search, feature noninterference, checkpoint corruption/incompatibility, symlink/canonical write rejection and resume.

## Strength evidence

Pairs swap candidate team positions on identical initial deals/bids/dealer/caller. Both policies use the same setup and mandatory reveal/challenge controls. Bootstrap intervals resample whole two-game pairs (5,000 replicates). Fixed-work runs use infinite time with bounded work; these are separate from matched 25 ms runs. No tuning occurred after inspecting fresh held-out results.

| Run vs corrected-search unless stated | Pairs | V2 wins–losses | Win rate | Paired 95% interval | Official signed score total |
| --- | ---: | ---: | ---: | --- | ---: |
| Smoke, seeds 10000–10049 | 50 | 45–55 | 45% | 36–54% | -429 |
| Development, 11000–11199 | 200 | 201–199 | 50.25% | 46.5–53.75% | -429 |
| Development first 50, common ablation deals | 50 | 53–47 | 53% | 46–60% | 117 |
| Weighted beliefs, same first-50 deals | 50 | 51–49 | 51% | 42–61% | -78 |
| No partnership, same first-50 deals | 50 | 57–43 | 57% | 48–66% | 39 |
| No adaptive routing, same first-50 deals | 50 | 56–44 | 56% | 48–64% | 234 |
| Vs advanced-search, 12000–12049 | 50 | 51–49 | 51% | 42–60% | 156 |
| Matched 25 ms, 13000–13199 | 200 | 212–188 | 53% | 49–57% | 234 |
| **Fresh fixed-work held-out, 700000–700999** | **1,000** | **1,071–929** | **53.55%** | **51.65–55.4%** | **1,248** |
| Learned root-prior search, 14000–14049 | 50 | 58–42 | 58% | 49–66% | 312 |
| Learned policy only, same deals | 50 | 31–69 | 31% | 23–39% | -1,092 |

All these runs completed with **zero invalid moves, aborted hands, reported invalid worlds or fallbacks**. The matched-time comparison had five v2 deadline stops; fixed-work runs had none. Smaller ablations are inconclusive and were not used to select parameters after holdout. No claim that weighted beliefs, partnership rollout, adaptive routing or neural guidance improves strength is established by these samples.

Held-out v2 completed **1,285,895 terminal simulations** over **486,112 proposed worlds** reused in decision-local empirical pools. These are not 1.28 million independent worlds. It allocated 1,180,009 tree nodes across 30,382 searches; public exact solver usage was zero. The shared one-card boundary bypasses the controller, so controller counters exclude those decisions (total v2 card decisions: 40,388).

Official score is the existing dealer-relative hand adjustment signed in favor of the candidate, not trick majority or a conventional two-score difference. Held-out mean signed adjustment is +0.624 per hand; this descriptive result is not a separate score-significance claim.

Fixed-work held-out decision mean/p95/max was v2 **5.438/14.049/69.649 ms**, corrected **1.969/11.534/46.404 ms**. These unbounded-time measurements include shared-host evaluation/validation activity. They do not substitute for the separate live-load experiment.

Twenty complete matches on ten paired initial seeds (15000–15009) completed 183 hands, with v2 winning **12–8**, paired interval **40–80%**. Subsequent dealers and positions legitimately diverge. This small exploratory match result is separate from the controlled paired-hand evidence and cannot establish full-match superiority.

## Belief calibration and simulator performance

The seeded calibration probe uses 78 midgame observations, 32 proposals each, with paired proposals under uniform/weighted modes. Remaining-card binary ownership is evaluated at other seats with Brier score and clipped log loss. There were **zero constraint violations**.

| Generating opponent | Uniform Brier / log loss | Weighted Brier / log loss | Weighted mean ESS |
| --- | --- | --- | ---: |
| Random | .22431 / .64000 | .22538 / .64258 | 30.26 / 32 |
| Lowest legal | .22730 / .64706 | .22535 / .64258 | 31.10 / 32 |

Weighting slightly improves the modeled low-card case and slightly worsens policy mismatch. It stays off by default. Matching proposals are not claimed uniform or calibrated Bayesian posteriors. Diversity and sampling timings are retained in the raw observation rows; an extreme-weight regression explicitly verifies impoverishment detection and resampling.

The card microbenchmark favored typed-array membership/iteration over BigInt allocation. A warmed 500-rollout comparison using identical low-card actions and equal authoritative terminal utilities measured **139.411 ms authoritative versus 55.248 ms compact (2.52×)**. This isolated throughput result does not imply that an entire ISMCTS decision is faster than corrected-search. Observation construction, sampling and tree work still dominate substantial computation.

## Learning evidence and safety

Training: eight seeded self-play hands (400000–400007), 249 search-labeled samples, five epochs/1,245 updates. Separate validation: four hands starting 400100, 118 samples. Features contain only legitimate actor observations; targets use authoritative eventual team hand/match utility divided by the known bound 1,208. No reward shaping or actual hidden-hand inputs are used.

Validation cross-entropy **1.61012**, essentially equal to legal-uniform **1.61005**. Value MSE **.31672** is worse than zero-value baseline **.24086**. Policy-only match performance is poor (31%). Therefore the head is experimental and its values do not bootstrap search. The 58% guided-search development sample has a confidence interval including 50%; no neural-guidance strength claim follows.

Experimental checkpoint payload SHA256: `1bd67c5220bcb65751c8dbf194794b2c00c513d12f8c8d1db7845fb4ada12a89`; resumed checkpoint: `a3015c8b992be1794a9db5e6285f81f62019734e393e8c5d65db10d8c3730257`. They remain in ignored `server/ai/models/experiments/v2/`. Dataset hashes and validation metrics are in the committed evidence.

Canonical checkpoint before/after benchmarks, training, resume and tests:
`66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

## Live load

Instrumented results below use 24 rounds at 700 ms cadence, 8/16/32 rooms, the yielding room queue, existing learning callbacks and four-player state serialization. Startup is excluded; socket/network delivery is not measured. This closed-loop burst workload is not an unbounded arrival-rate stress test. Later positions differ by policy. One instrumented run per policy/room count is descriptive, not a timing confidence interval or hard worst-case bound. Initial runs before adding v2-specific counters are also retained in the artifact; the repeat was instrumentation, not parameter tuning.

| Rooms | Policy | Mean / p95 / max decision (ms) | p95 room wait (ms) | Max event-loop delay (ms) | Search deadline stops / fallbacks |
| ---: | --- | --- | ---: | ---: | --- |
| 8 | corrected-search | 3.112 / 16.610 / 29.004 | 71.668 | 37.880 | 2 / 0 |
| 8 | ai-v2-ismcts | 8.033 / 17.804 / 28.022 | 100.955 | 30.097 | 3 / 0 |
| 16 | corrected-search | 2.784 / 14.573 / 28.333 | 123.171 | 30.835 | 3 / 0 |
| 16 | ai-v2-ismcts | 8.977 / 20.387 / 28.877 | 205.146 | 31.621 | 7 / 0 |
| 32 | corrected-search | 2.648 / 14.517 / 28.558 | 244.509 | 40.272 | 5 / 0 |
| 32 | ai-v2-ismcts | 7.731 / 16.564 / 28.125 | 370.821 | 40.665 | 7 / 0 |

The 25 ms limit is **soft**. Individual matching, observation, engine/scoring operations, GC and OS pauses are not preempted. Simulations/nodes/proposals are independently capped and safe boundaries check deadlines. Interrupted paths do not contribute partial statistics; failures route to corrected-search with the remaining budget. No worker threads or hard-time guarantee were introduced. Higher mean compute and queued wait are material limitations even where maximum event-loop delay happens to be lower in a particular run.

## Reproduction and artifacts

```sh
npm ci --cache /tmp/bundrung-npm-cache
npx tsc --noEmit
npm run typecheck:ai
npm test
npm run build
npm run benchmark:tactics
npm run test:parity
npm run benchmark:v2:cards
npm run benchmark:v2:throughput
npm run benchmark:v2:beliefs > /tmp/v2-calibration.json
npm run benchmark:v2 -- --seed 10000 --pairs 50 --output /tmp/smoke.json
npm run benchmark:v2 -- --seed 11000 --pairs 200 --output /tmp/development.json
npm run benchmark:v2 -- --seed 700000 --pairs 1000 --output /tmp/heldout.json
npm run benchmark:v2 -- --seed 13000 --pairs 200 --time-ms 25 --output /tmp/timed.json
npm run benchmark:v2 -- --seed 11000 --pairs 50 --weighted true --output /tmp/weighted.json
npm run benchmark:v2 -- --seed 11000 --pairs 50 --partnership false --output /tmp/no-partner.json
npm run benchmark:v2 -- --seed 11000 --pairs 50 --adaptive false --output /tmp/no-adaptive.json
npm run benchmark:v2 -- --seed 12000 --pairs 50 --baseline advanced-search --output /tmp/advanced.json
npm run learn:v2 -- capture --games 8 --teacher-commit 2c166275e04a53ad9a4759ab9184c346b5fecb0f --output /tmp/v2-trajectories.json
npm run learn:v2 -- train --output server/ai/models/experiments/v2/imitation.json
npm run learn:v2 -- train --resume server/ai/models/experiments/v2/imitation.json --epochs 1 --output server/ai/models/experiments/v2/resumed.json
npm run learn:v2 -- capture --seed 400100 --games 4 --teacher-commit 2c166275e04a53ad9a4759ab9184c346b5fecb0f --output /tmp/v2-validation-trajectories.json
npm run learn:v2 -- evaluate
npm run benchmark:v2 -- --seed 14000 --pairs 50 --checkpoint server/ai/models/experiments/v2/imitation.json --neural-mode guided --output /tmp/guided.json
npm run benchmark:v2 -- --seed 14000 --pairs 50 --checkpoint server/ai/models/experiments/v2/imitation.json --neural-mode policy --output /tmp/policy.json
node --import tsx scripts/v2-match-benchmark.ts
node --import tsx scripts/v2-root-probe.ts
npm run benchmark:latency -- --policy ai-v2-ismcts --scheduler queued --rooms 32 --rounds 24 --output /tmp/load.json
```

Use unique output files: benchmark/capture writers refuse existing paths. CLI outputs include seeds, parameters, Node version, canonical hashes and diagnostics. Raw per-card JSON remains in this workspace under `/tmp/v2-*.json`; [ai-v2-results.json](../benchmarks/ai-v2-results.json) retains paired outcomes, hashes, aggregate counters, calibration rows, representative root visits/values, model metrics and all load runs without huge per-card arrays. `scripts/v2-summarize.ts /tmp` rebuilds that compact artifact using the documented run filenames. Final held-out seeds must not be recycled for tuning a later version.

## Remaining limitations

Single-observer/model-based search retains determinization bias; the rollout opponent is simplistic. Low particle counts, a biased proposal distribution and limited behavioral calibration remain. Adaptive routing is heuristic, and its development ablation does not establish benefit. Public exact solving is intentionally rare. Learning uses a small linear baseline, with poor value/generalization results; value bootstrapping and stronger learned models are deferred rather than represented as validated. Soft deadlines, increased average computation and queue waits prevent claiming a production-ready stronger default. Preserve the baselines for review and future independent comparisons.


## Subsequent search-focused refinement

The results above remain historical. See [AI_V2_SEARCH_REFINEMENT.md](AI_V2_SEARCH_REFINEMENT.md) and [ai-v2-search-refinement.json](../benchmarks/ai-v2-search-refinement.json) for the later 256-test validation, allocation-equivalence probe, adversarial information-set regressions, fresh matched-time held-out comparison and direct rollout duel. These outcomes are not pooled with the earlier fixed-work or held-out sets. Both production and V2 rollout defaults remain unchanged.
