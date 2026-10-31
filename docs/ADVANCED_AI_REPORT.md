# Phase 2 advanced-search results

## Recommendation

Keep **corrected-search as the default**. Advanced-search is suitable for opt-in experiments, not production promotion. The held-out win interval includes 50%, the win rate is below the preferred 55% target, and average computation/room waiting increased. No automatic merge or promotion is performed.

## Delivered changes

- Decision-local opponent beliefs distinguish known ownership/voids from matching-sample and marginal estimates. Partial disclosures and remembered concealed plays cannot become possible cards elsewhere.
- Observation-only partnership continuations conserve safe partner winners, contest vulnerable winners, account for eligible individual streaks, protect comparable trump resources and evaluate downgraded Aces correctly.
- Advanced-search reuses atomic common-world comparisons and official engine scoring, with a bounded action shortlist and adaptive world count. Existing policy algorithms remain unchanged.
- A bounded, cached team-minimax solver handles publicly determined endgames only. Private inspection or a sampled complete hand is insufficient to claim an exact solution.
- Existing server policy context and room queue support opt-in `BOT_DECISION_POLICY=advanced-search`. Gameplay rules, Socket.IO contracts, dependencies and canonical weights are unchanged.
- Benchmark schema v3 adds per-policy search counters, solver usage and real partnership outcomes. A separate 14-case tactical harness verifies action legality with the authoritative engine.

See [ADVANCED_AI_STRATEGY.md](ADVANCED_AI_STRATEGY.md) for implementation details and [advanced-ai-results.json](../benchmarks/advanced-ai-results.json) for machine-readable summaries and paired outcomes.

## Evaluation protocol and reproducibility

Base: `0feadd15502f55e6e7c0337ae617aebbb3a22e1d`. Final policy frozen at `14a089a`; subsequent changes add validation/documentation and strengthen a test referee, without changing decisions. Node `v24.19.0`.

Each pair uses the same seeded deal, bids, dealer and caller, with candidate teams swapped. Setup uses the unchanged heuristic policy; challenge acceptance and forced reveal controls are shared across policies. After policies diverge, their game trajectories naturally differ. Confidence intervals use 5,000 bootstrap resamples of whole deal pairs. Fixed-work strength runs use infinite time; corrected-search gets 16 iterations, advanced-search at most four worlds (two in ordinary states), at most four candidates and safety threshold 0.75. Legacy retains its bounded 100 iterations.

Development seeds 1–50 and 201–400 are disjoint from held-out seeds 200000–200999. Sensitivity thresholds 0.6 and 0.9 use development seeds 201–250. Neither showed compelling evidence to replace 0.75. No strategy parameters changed after held-out outcomes were inspected. An initial holdout process on 100000–100999 was stopped **before producing/inspecting results** to correct analytic hard-fact exclusions identified in code review. Earlier exploratory development numbers are superseded below.

Full CLI JSON outputs remain in `/tmp/advanced-final-*.json`, `/tmp/advanced-v-*.json` and `/tmp/phase2-latency-*.json` in this workspace. The committed compact artifact preserves raw-output SHA256 hashes, all paired deal outcomes/hashes, score adjustments, errors, aggregate diagnostics, versions and latency distributions. Reproduction commands are in [AI_BENCHMARKS.md](AI_BENCHMARKS.md).

## Strength results

| Run | Pairs | Advanced wins–losses | Win rate | Paired 95% interval | Signed official score total |
| --- | ---: | ---: | ---: | --- | ---: |
| Smoke vs corrected | 50 | 57–43 | 57% | 49–65% | 273 |
| Development vs corrected | 200 | 197–203 | 49.25% | 45–53.5% | -117 |
| **Held-out vs corrected** | **1,000** | **1,035–965** | **51.75%** | **49.9–53.6%** | **780** |
| Development safety 0.6 vs corrected | 50 | 51–49 | 51% | 42–61% | 156 |
| Development safety 0.9 vs corrected | 50 | 49–51 | 49% | 40–58% | 78 |
| Secondary vs heuristic | 50 | 54–46 | 54% | 45–63% | 156 |
| Secondary vs preserved legacy | 50 | 55–45 | 55% | 46–64% | 312 |

The official score is dealer-relative, signed in favor of the candidate; it is not a conventional two-team accumulated score or trick majority. Held-out mean signed adjustment is +0.39 per hand. This is descriptive, not a statistically established score gain. All seven final runs completed with zero invalid moves, aborted games, sampling failures, invalid worlds, transition/internal errors or search fallbacks. Infinite-time runs have no deadline stops.

Held-out advanced search completed **90,876 common-world comparisons** versus corrected-search's 118,336. Advanced continuations made 5,940,642 choices; their reason counters are simulated preferences rather than observed successes. In actual candidate-team decisions with partner currently winning, 7,149 conserved (team ultimately won 6,037 of those tricks), and 1,308 overtook (team won 1,065). These are confounded observational counts, not proof that either tactic is causally superior. Some opportunities can occur within the same trick.

Public endgame solver usage was **zero** in these tournaments because ordinary bots do not disclose all remaining hands. Separate tests cover actual publicly shown engine endgames, budget abstention and a two-trick puzzle requiring sacrificing trick 12 to win trick 13. No ordinary-game gain is attributed to the solver.

## Live latency and recovery

Same load configuration: eight rooms, 24 rounds, 700 ms cadence, room queue, in-memory learning callbacks and four-player serialization. Startup/model loading excluded. One run per policy; policies produce different later positions, so this is a representative load comparison, not a paired microbenchmark or worst-case guarantee.

| Metric | Corrected-search | Advanced-search |
| --- | ---: | ---: |
| Decisions | 178 | 182 |
| Mean decision | 3.413 ms | 8.465 ms |
| p95 decision | 17.661 ms | 18.837 ms |
| Maximum decision | 28.760 ms | 28.839 ms |
| p95 queued room wait | 79.101 ms | 100.352 ms |
| Maximum queued room wait | 123.002 ms | 159.306 ms |
| Maximum event-loop delay | 41.648 ms | 37.126 ms |
| Deadline stops / discarded partial vectors | 3 / 3 | 3 / 3 |
| Legal search fallbacks | 0 | 1 |
| Sampling / transition / internal errors | 0 / 0 / 0 | 0 / 0 / 0 |

Advanced-search increases average computation about 2.48 times and room waiting. Maximum/p95 event-loop measurements are noisy and do not establish an improvement. The 25 ms limit is soft: one sampler, continuation, serialization, engine transition, GC or OS pause can overrun it. World/candidate/node caps bound work; deadline checks prevent continuing a long rollout past subsequent safe boundaries. The queue yields between room jobs. No worker threads or hard-preemption guarantee are introduced.

Fixed-work held-out timings were advanced mean/p95/max 5.016/11.841/51.123 ms versus corrected 1.756/11.132/88.728 ms. These unbounded-time tournament measurements include shared-host validation/sensitivity activity and should not be substituted for the separate live-budget experiment.

## Validation and limitations

- `npx tsc --noEmit`: passed.
- `npm run typecheck:ai`: passed.
- `npm test`: **209 tests, 22 files passed**, including 30 advanced policy tests and seeded advanced match reproduction. Existing Socket.IO tests run with loopback port access.
- `npm run build`: passed; existing Vite >500 kB chunk warning.
- `npm run benchmark:tactics`: **14/14 passed**, with engine-verified legal sets. Puzzle success is not a match-strength claim.
- Canonical model SHA256 before/after tests and all benchmarks: `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

Confirmed design limitations: low particle counts and non-uniform matching prior; correlated marginal estimates; shortlist omission risk; simulated opponent policy mismatch; no bidding-behavior posterior; no persistent opponent profiles; public-only solver rarely eligible; soft deadlines and higher mean load. Continuations do not receive opponents' sampled hands, but information-set Monte Carlo still has approximation/strategy-fusion limitations. These games evaluate individual hands from a fresh scorecard, not complete multi-hand match campaigns. Existing terminal scoring nevertheless accounts for actual KHOTI/match results when reached.

Unverified hypothesis: more realistic partnership rollouts improve general strength. The independent interval does not establish this. Further algorithm changes should use a new development/evaluation protocol rather than tune against this held-out set.
