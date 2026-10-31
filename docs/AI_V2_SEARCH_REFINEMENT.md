# Search-efficiency and matched-time refinement

This follow-up concentrates on search allocations, rollout evaluation and information-set adversarial tests. `corrected-search` remains the production default. V2 retains its original rollout by default; `v2.rollout='control'` is a separate experimental option. Neural models and training are unchanged.

## Frozen protocol

Code/parameters frozen before final outcomes: 64 maximum iterations, 16 proposals, 512 nodes, adaptive controller, unweighted beliefs, public-only exact solver, 25 ms total soft decision budget. Control's safety band is 0.75. Development: smoke seeds 30000–30049; 200 paired deals 32000–32199. Fresh matched-time control-versus-corrected evaluation: **900000–900999**, never used previously. Independent direct control-versus-original-rollout duel: **910000–910199**, with each team receiving its own configuration and the same policy implementation. No tuning against final results. Allocation ablation uses the same development deals with template reuse and lightweight observation construction disabled.

The original fixed-work and 25 ms reports remain historical. New clock-limited outcomes are reported separately, using complete paired deals as bootstrap units. Latency load runs use 8, 16 and 32 rooms, 24 rounds and the existing queue, separately for corrected, retained V2 rollout and experimental control rollout. No concurrent benchmark jobs run during final timed comparisons/load tests.

## Implementation

- Compact templates are validated/adapted once per sampled particle identity and explicitly cloned for each simulation. Templates, sibling clones and live state remain independent.
- Rollout frames omit unused historical Play DTOs. Tree keys encode the same sanitized complete history directly from compact state, avoiding object copying; fixed-width history fragments avoid ambiguous concatenation. Public requester/revealer, counts and disclosed-card facts are explicit in keys.
- Observation construction uses an explicit Play whitelist, redacts concealed Ace metadata, and hides winning-card aliases found in history, the active trick or accumulated records. Own cards and legitimate public reveals/disclosures remain available.
- The control rollout estimates team survival from observation-only unseen-card marginals, public voids, remaining seats/counts and legitimately disclosed holdings. It accounts for downgraded lead Aces, eligible individual streaks, vulnerable partner winners, trump conservation and final-trick risk. It never reads another player's undisclosed sampled hand. Estimates remain approximate; no new hard sampling constraints or shaped rewards are introduced.
- Benchmark configurations can differ by team even when both use `ai-v2-ismcts`. Candidate-team membership labels latency correctly, and partnership metrics no longer accidentally count both teams in same-policy duels.

## Validation and limitations

New regressions compare historical root visits/values and nodes, optimized versus allocation-ablation searches on reachable midgames, template/sibling immutability, DTO versus direct information keys over actual transitions, feasible-world noninterference, hidden metadata/debug aliases, public reveal-state separation, known ownership and all 14 tactical preferences. An injected fourth-simulation transition failure proves that a decision with earlier completed simulations fails closed to corrected-search instead of returning censored search statistics.

The control model is a stronger *evaluation mechanism*, not an assumed stronger policy. Hypergeometric marginal and independence approximations, modeled-opponent bias, limited particles and soft deadlines remain. It stays optional pending independent strength and latency evidence. The exact solver and learning pipeline are not redesigned.



## Completed pre-evaluation checks

- All **256 tests in 27 files** passed, including the 18,664-transition parity gate and targeted rare rules.
- Both TypeScript validations and production build passed (existing Vite chunk-size warning only); tactical benchmark 14/14 passed.
- Three alternating-order passes over twenty seeded openings produced identical root visits/values/node counts between allocation modes. Aggregate probe time was 1,355.36 ms versus 1,079.34 ms (about 20.4% lower), with root adaptations reduced from 3,840 to 939. This is a small local timing probe, not a production latency guarantee.
- Final development at matched 25 ms: retained rollout 205–195 / 51.25% (47–55.75% CI); control 221–179 / 55.25% (51.25–59.25%). Control was slower, so it was not made default. The independent held-out and direct-duel results are required to assess this hypothesis further.

## Reproduction

```sh
npm run benchmark:v2:efficiency -- /tmp/v2-efficiency-final3.json
npx vitest run __tests__/V2Refinement.test.ts __tests__/V2MatchedBenchmark.test.ts
npm run benchmark:v2 -- --seed 32000 --pairs 200 --time-ms 25 --rollout legacy --output /tmp/v2-refine-legacy200.json
npm run benchmark:v2 -- --seed 32000 --pairs 200 --time-ms 25 --rollout control --output /tmp/v2-refine-control200.json
npm run benchmark:v2 -- --seed 32000 --pairs 200 --time-ms 25 --rollout legacy --reuse-templates false --light-rollouts false --output /tmp/v2-refine-allocation200.json
npm run benchmark:v2 -- --seed 900000 --pairs 1000 --time-ms 25 --rollout control --output /tmp/v2-refine-heldout1000.json
npm run benchmark:v2 -- --seed 910000 --pairs 200 --time-ms 25 --rollout control --baseline ai-v2-ismcts --baseline-rollout legacy --output /tmp/v2-refine-duel200.json
npm run benchmark:latency -- --rooms 32 --rounds 24 --scheduler queued --policy ai-v2-ismcts --rollout control --output /tmp/v2-refine-load-32-control.json
node --import tsx scripts/v2-refinement-summarize.ts /tmp
```

Run the load command for all three room counts (8/16/32), both V2 rollout modes, and corrected-search. Use unique output paths. Raw CLI JSON stays in `/tmp/v2-refine-*.json`; the compact evidence preserves paired outcomes, raw hashes, configurations, counters and all load measurements. Fixed-work equality does not imply identical clock-limited decisions: saved compute can complete an additional simulation before a deadline.

Matched-ceiling caveat: the prespecified primary experiment retains corrected-search's 16-iteration cap and V2's 64-simulation cap under the same 25 ms maximum. This is deployment-configuration evidence, **not equal CPU consumption**. A separate exploratory development sweep allows 1,000 corrected iterations and 10,000 V2 simulations at 5/10/25 ms, so uncertainty searches can consume their ceiling. Those development results must not be mistaken for another independent held-out result or used to retroactively tune the frozen primary configuration.

## Frozen evaluation results

| Experiment | Pairs | Control/retained candidate wins–losses | Paired 95% win interval | Official signed score |
| --- | ---: | ---: | --- | ---: |
| Retained V2, development | 200 | 205–195 | 47–55.75% | -390 |
| Control, development | 200 | 221–179 | 51.25–59.25% | 468 |
| Retained V2, allocation ablation | 200 | 206–194 | 47.25–55.75% | -117 |
| **Control vs corrected, fresh held-out** | 1000 | 1041–959 | 50.15–53.9% | 312 |
| **Control vs retained V2, independent duel** | 200 | 194–206 | 44.25–52.75% | -819 |

Control's primary held-out win rate is **52.05%**, nominal paired interval **50.15–53.9%**. It has a small advantage over corrected-search under the tested capped-work/25 ms configuration, below the preferred 55% promotion target. The independent direct duel is **48.5%** (44.25–52.75%): richer evaluation is **not established as stronger than the retained V2 rollout**. Both defaults therefore remain unchanged.

All formal games completed with zero invalid moves, aborted games, reported invalid worlds and V2 fallbacks. Control's primary had 1,243 interrupted searches; only completed simulation paths contributed statistics. It completed 1,349,359 terminal simulations over 513,728 proposed worlds. In the same-policy duel, diagnostic counts pool both teams while latency is correctly separated by candidate-player membership.

Primary matched-ceiling latency was control mean/p95/max **7.759/22.499/84.837 ms**, corrected **1.864/10.991/34.159 ms**. Equal ceilings do not mean equal CPU usage. The rare 84.8 ms synchronous decision is a material soft-deadline limitation, not hidden by reporting only short load-run maxima. No hard preemption or worker threads were added.

On the shared development deals, disabling allocation optimizations increased retained-rollout mean decision time from **5.114 to 6.248 ms**. Time-limited wins differed by one game (205 versus 206); faster execution is not itself a strength claim. Fixed-work probe statistics were identical.

### Exploratory larger-cap development sweep

Each row uses 50 development pairs, without neural guidance. The ceilings can be consumed rather than being cut short by the original 16/64 work caps. These post-primary development diagnostics are not new holdouts, all intervals include 50%, and no parameters were retuned from them. Official signed score totals were zero in these particular weighted-scoring samples; paired rows preserve the arithmetic.

| Ceiling | V2 / corrected work caps | Wins–losses | Paired 95% interval | Mean V2 / corrected ms | V2 fallbacks |
| --- | --- | ---: | --- | --- | ---: |
| 5 ms | 10,000 / 1,000 | 50–50 | 42–58% | 3.857 / 1.093 | 2 |
| 10 ms | 10,000 / 1,000 | 53–47 | 44–62% | 7.651 / 2.208 | 0 |
| 25 ms | 10,000 / 1,000 | 56–44 | 48–63% | 18.823 / 5.360 | 0 |

### Instrumented room load

Same 24-round queued workload at all room counts, including existing learning callbacks and four-player serialization; startup excluded, socket delivery not measured. Separate runs can reach different later positions. The samples do not provide worst-case timing bounds.

| Rooms | Policy/rollout | Mean / p95 / max decision ms | p95 queue wait ms | Max event-loop delay ms | Deadline stops / fallbacks |
| ---: | --- | --- | ---: | ---: | --- |
| 8 | corrected | 3.013 / 15.669 / 29.109 | 72.554 | 34.505 | 1 / 0 |
| 8 | legacy | 7.317 / 16.422 / 28.071 | 90.480 | 33.849 | 2 / 0 |
| 8 | control | 13.076 / 25.519 / 30.221 | 138.352 | 31.588 | 22 / 0 |
| 16 | corrected | 2.777 / 14.470 / 28.651 | 122.273 | 37.290 | 2 / 0 |
| 16 | legacy | 7.420 / 16.024 / 28.319 | 174.643 | 45.482 | 2 / 0 |
| 16 | control | 12.639 / 25.461 / 30.895 | 263.523 | 49.381 | 39 / 0 |
| 32 | corrected | 2.600 / 14.090 / 28.444 | 259.720 | 51.544 | 5 / 0 |
| 32 | legacy | 7.141 / 14.944 / 28.531 | 337.182 | 30.458 | 4 / 0 |
| 32 | control | 13.007 / 25.483 / 28.127 | 557.262 | 35.127 | 88 / 0 |

Corrected-search had 27 deadline recoveries and no fallback in the primary held-out run. A separate retained-rollout development comparison had one corrected-search budget fallback. These legal recovery events are distinct from invalid worlds or invalid moves. Detailed counters for every run are in the evidence.

Control substantially increases compute and queue waiting. At 32 rooms its p95 queue wait was **557.262 ms**, versus **337.182 ms** for retained V2 and **259.720 ms** for corrected-search. These costs reinforce keeping control optional. Even retained V2 remains more expensive than corrected-search.

## Delivery interpretation

Keep `corrected-search` as the production default and the original V2 rollout as its experimental policy's default. Retain control solely as a measured opt-in experiment; no learning/checkpoint change or promotion is justified. New model experiments were not trained or enabled. Canonical SHA256 remains `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

The final validation suite passes **256 tests across 27 files**, both TypeScript checks, the production build (existing chunk warning), and 14 tactical cases. Full and lightweight control summaries/root statistics agree on reachable histories; separate callbacks prove that same-policy duels actually route the requested configuration to each team.

[Machine-readable evidence](../benchmarks/ai-v2-search-refinement.json) preserves all paired outcomes, raw-output hashes, counters, configurations, efficiency-probe root statistics and nine load measurements. Earlier reports remain historical and are not pooled with these outcomes.

Configuration note: `--partnership false` applies to the retained rollout. Combining it with control is rejected rather than silently labelling an unchanged control policy as a cooperation ablation.
