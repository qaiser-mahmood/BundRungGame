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
