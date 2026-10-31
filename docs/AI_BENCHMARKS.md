# AI benchmarks and repair comparison

## Reproduce

From the repository root, using locked dependencies:

```sh
npm ci
npx tsc --noEmit
npm run typecheck:ai
npm test

# Small deterministic smoke: two deals, both team assignments.
npm run benchmark:ai -- --candidate corrected-search --pairs 2

# 200 paired deals / 400 hands for each comparison.
npm run benchmark:ai -- --seed 1 --pairs 200 --candidate corrected-search --iterations 16 --output /tmp/corrected.json
npm run benchmark:ai -- --seed 1 --pairs 200 --candidate production-legacy --output /tmp/legacy.json
npm run benchmark:ai -- --seed 1 --pairs 200 --candidate corrected-search --baseline production-legacy --iterations 16 --output /tmp/head-to-head.json

# Optional larger tournament (not executed in this repair).
npm run benchmark:ai -- --seed 1000 --pairs 1000 --candidate corrected-search --baseline production-legacy --output /tmp/large.json

# Only short smoke training was executed; outputs must be new experimental files.
npm run train:ai -- --games 2 --seed 1 --batch-size 4 --output /tmp/selfplay-new.json
npm run train:imitate -- --games 2 --seed 1 --output /tmp/imitation-new.json
npm run train:ai -- --games 1 --seed 3 --epsilon 0 --batch-size 4 --resume /tmp/selfplay-new.json --output /tmp/resumed-new.json
```

`tsconfig.ai.json` covers server, shared code, scripts and tests. Both trainers
now pass it; no obsolete methods or suppressed trainer errors remain. Training
requires `--output`; existing files and canonical aliases are rejected. SIGINT
has no handler that overwrites the baseline. Resume validates the supplied file.
There is no automatic model promotion or claim of stronger trained weights.

The CLI adds no dependencies, browser, service, GPU or heavyweight test runner.
`node --import tsx scripts/ai-benchmark.ts ...` emits JSON-only stdout; `npm run`
adds npm's own banner. Diagnostics go to stderr. `--output` exclusively creates a
new JSON file. Nonzero exit means invalid arguments, invalid moves, aborted games
or failed export; aborted hands never count as wins. Output cannot overwrite the
canonical checkpoint. Model checksums are verified before/after tournaments.

## Policies and fairness

All policies consume the same corrected public/private observation boundary and
engine-legal cards. `heuristic` retains the tactical tree and selects its first
vetted candidate. `production-legacy` retains the old approximate MC algorithm
and 100 rollouts, including its known flaws, for evaluation only.
`corrected-search` retains tactical pruning and evaluates candidates through
constrained worlds and the real engine. `neural-direct` bypasses tactical pruning
and uses a validated masked network for evaluation only. Older `production` and
`neural` CLI aliases map to `production-legacy` and `neural-direct`.

No policy monkey-patches BotPlayer methods. The isolated synchronous benchmark
uses a scoped seeded `Math.random` stream because the existing engine's setup
RNG is global; it restores that stream in `finally`. Do not run tournaments
concurrently in one JavaScript process or in the live server. PRNG: Mulberry32;
seeds are uint32; pair seed is `(seed + pairIndex) >>> 0`.

Setup/toss/shuffle/cut/bidding are identical heuristic controls for all policies.
Each seed resets setup; candidate policies exchange TEAM_1/TEAM_2 on the same
seat hands, dealer/caller, trump context and initial private-state fingerprint.
Fingerprints must match. Play uses a separate seeded stream. Different policies
can consume it differently; within corrected search every candidate uses the
same sampled world per iteration. Model loading happens before the play stream.

Reveal requests, caller show, resume and challenge acceptance are shared forced
controls, not learned actions. Their timings/counts are recorded separately from
card selection. The benchmark ends at GAME_RESOLVED or MATCH_OVER for **one
hand**; it is not a tournament of complete multi-hand matches. Engine scorecard
transfer and actual terminal KHOTI still apply within that hand.

Comparison budgets: corrected search 16 worlds with deterministic iteration
budget, no wall-clock cutoff; legacy 100 approximate worlds. These are **not equal
computational budgets**. Legacy iterations are separate from corrected iterations
and default to 100. The default live corrected policy instead has a soft 25 ms
limit checked between transitions and candidate calls. `--time-ms` can enable a benchmark
time cutoff, but the resulting world counts/outcomes need not replay exactly.
Iterations are capped at 1,000; each corrected rollout at 160 engine transitions.

The legacy policy now sees redacted information too. Thus these runs isolate
planner behavior on the corrected boundary; they are not bit-for-bit reruns of
pre-repair games that leaked hidden identities. Historical 40-game JSON files
remain unchanged for provenance, not directly comparable strength estimates.

## Results: 200 paired deals per run

Node v24.19.0, seeds 1–200, both team assignments, 31 October 2026.
Machine-readable report with per-hand outcomes and search counters:
[`benchmarks/ai-repair-comparison.json`](../benchmarks/ai-repair-comparison.json).
The report retains compact per-hand records and summary latency; CLI exports also
retain every decision/card and reveal action. Raw current-session CLI files are
`/tmp/repair-corrected-final.json`, `/tmp/repair-legacy-final.json`, and
`/tmp/repair-headtohead-final.json`.

| Candidate vs baseline | Wins–losses | Win rate / paired 95% CI | Signed points | Invalid / aborted |
| --- | --- | --- | ---: | --- |
| corrected-search vs heuristic | 201–199 | 50.25% / 47.50–52.75% | +39 | 0 / 0 |
| production-legacy vs heuristic | 188–212 | 47.00% / 44.25–49.75% | -117 | 0 / 0 |
| corrected-search vs production-legacy | 212–188 | 53.00% / 50.50–55.75% | +585 | 0 / 0 |

All 1,200 hands completed. Corrected search evaluated 24,288 complete common
worlds against heuristics and 22,384 head-to-head, with **zero sampling failures,
zero fallbacks and zero neural inferences**. The legacy policy reported no thrown
errors; its unvalidated sampling is intentionally not a consistency certificate.

| Run / policy | Decisions | Mean ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| vs heuristic / corrected-search | 8,398 | 9.065 | 62.586 | 246.416 |
| vs heuristic / production-legacy | 8,242 | 5.638 | 39.774 | 426.239 |
| head-to-head / corrected-search | 8,068 | 8.846 | 63.036 | 259.093 |
| head-to-head / production-legacy | 8,068 | 5.768 | 40.544 | 427.377 |

Reveal controls: corrected/heuristic run 726 actions, .0030 ms mean/.0060 ms p95;
legacy/heuristic 726, .0054/.0067 ms; head-to-head 724, .0042/.0065 ms.
These timings include cold/JIT/GC and shared-host effects. They are not hard
production latency guarantees; no network/UI time or learning work is included.
The head-to-head latency of legacy reflects its original 100-world budget.

Bootstrap intervals resample entire **deal pairs**, not individual correlated
games, with 5,000 resamples, Mulberry32 seeded from the tournament seed, percentile
endpoints 2.5%/97.5%. `pairedBootstrap` is exported by the harness. Paired win-rate
differences against the common heuristic can be recomputed from report outcomes;
the report contains that additional interval. These are diagnostic seed-suite
intervals, not held-out guarantees: seed 65 was used to correct a void-inference
bug, and policies do not optimize bidding/reveal decisions. Correctness repairs
alone do not establish general playing strength. No hyperparameter search or
model promotion was performed.

## Metrics, schema and limitations

Schema v2 includes seed/pairs, policies, budgets, Node version, model hashes,
per-hand deal hash, candidate team, authoritative winner, error, trick margin,
signed score, search counters, every card's decision latency and reveal controls.
Summary includes completed/aborted/invalid counts, wins, score total, per-policy
mean/p95/max latency and paired win-rate interval. The compact comparison report
has its own schema v1 and removes per-card arrays, retaining per-hand outcomes.

The engine has a dealer-relative score, not two conventional team scores.
`signedScoreAdjustment` uses the authoritative hand entry, negated when the
candidate is the entry's dealer team, unchanged otherwise. Positive favors the
candidate. It is not the post-transfer absolute dealer score. Trick margin is
not used to decide a winner. Search utility additionally recognizes actual
terminal match outcomes; the reported score remains the official hand adjustment.

Matching is not claimed uniform. An unconstrained 1,000-seed S_A ownership probe
was 346/335/319 for p1/p2/p3 with the actor holding all hearts. This sanity probe
cannot establish uniformity under constraints. Full midgame tests assert exact
52-card accounting, hard voids, legitimate fixed ownership and deterministic
seed reproduction, and reject infeasible worlds explicitly.

Canonical checksum before and after benchmarks, tests and smoke training:

`66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`

A 1,000-pair final comparison was not run: the required three 200-pair runs
already exercised 1,200 complete hands; extrapolated larger fixed-budget work
would add several minutes. Full multi-hand continuation, worker-thread hard
preemption, bidding posterior calibration and stronger-model claims remain
outside this correctness repair. See `AI_AUDIT.md` for unresolved limitations.

## Pre-merge latency and recovery refinement

See [AI_REFINEMENT_REVIEW.md](AI_REFINEMENT_REVIEW.md) and
[ai-refinement-results.json](../benchmarks/ai-refinement-results.json) for the
eight-room direct/queued load experiments, two 50-pair targeted comparisons,
recovery counters and commands. Live deadlines now check between engine
transitions/candidate calls and a per-room timer queue prevents timer bursts.
They are still soft limits. The original 200-pair report remains historical; the
refinement removes incidental toss RNG consumption during rollouts and should
not be pooled with its finite-world outcomes.

## Phase 2 advanced-search evaluation

The earlier repair results above are historical. Phase 2 uses schema v3, adding
per-policy search counters, advanced continuation counts, public endgame solver
usage and observed candidate-team partnership outcomes. `worlds` counts completed
atomic candidate comparisons. `protectPartner`/`contest`/`streak` count **simulated
continuation preferences**, not successful real-game tactics. `partnership`
records real decisions when partner was winning, whether the candidate overtook,
and whether its team eventually won that trick. These are observational,
confounded counts, not causal proof that conserving or overtaking is better.

Reproduce strength separately from latency:

```sh
npm run benchmark:tactics
npm run benchmark:ai -- --seed 1 --pairs 50 --candidate advanced-search --baseline corrected-search --output /tmp/smoke.json
npm run benchmark:ai -- --seed 201 --pairs 200 --candidate advanced-search --baseline corrected-search --output /tmp/development.json
npm run benchmark:ai -- --seed 200000 --pairs 1000 --candidate advanced-search --baseline corrected-search --output /tmp/heldout.json
npm run benchmark:latency -- --policy corrected-search --scheduler queued --output /tmp/corrected-latency.json
npm run benchmark:latency -- --policy advanced-search --scheduler queued --output /tmp/advanced-latency.json
```

Fixed-work strength defaults: corrected 16 iterations; advanced at most four
worlds (two ordinary), four candidates, safety probability 0.75. Time is infinite
for seeded strength reproduction, not for deployment. `--safe-partner` and
`--advanced-worlds` permit development sensitivity experiments. Live latency uses
25 ms, eight concurrent rooms, 24 rounds and the existing yielding room queue.
Paired bootstrap resamples entire two-position deals (5,000 replicates). Report
raw wins, paired intervals, signed authoritative adjustments, invalid/aborted
hands, failures/fallbacks and latency; do not equate puzzle accuracy with strength.
See [ADVANCED_AI_REPORT.md](ADVANCED_AI_REPORT.md) and committed machine-readable
summary artifacts for measurements, execution versions and model hashes.
