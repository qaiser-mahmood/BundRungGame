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

Results, commands and final interpretation are appended after the frozen evaluation finishes.

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
