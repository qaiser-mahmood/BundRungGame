## Expert-data foundation with explicit supervised gate

Implements stage A and offline baseline scaffolding from the V3 contract. No human expert labels or validated intent teacher are available. The contract requires requesting labels at this point; this PR does **not** claim trained V3 intelligence or improved playing strength.

- Adds 519 versioned observation-only strategic features, legal masks, public chronology and explicit uncertainty. Hidden opponent hands, undisclosed trump and metadata aliases cannot enter inputs; adversarial feature/prediction invariance tests cover the boundary.
- Adds reproducible official-engine position generation, blind one-position-per-deal expert assignments, ranked legal alternatives, probabilistic latent labels, confidence/reasoning, revisions and disagreement reporting. Split checks isolate initial deals and source opponent families; import rejects future/alternate-view annotation contamination.
- Adds offline regularized, masked multinomial baseline scaffolding with class balancing, validation-only calibration, proper scores, abstention and isolated atomic checkpoints. No checkpoint is trained or written without real train/validation annotations.
- Provides a reproducible 16-deal/64-position workflow fixture and 16 blank blind expert cases. These bot trajectories are not expert demonstrations.

## Validation

285 tests / 30 files pass, including 29 new V3 tests and existing rule-parity tests. Both TypeScript checks, production build and 14/14 tactical checks pass. Build retains the existing chunk-size advisory. Canonical checkpoint SHA256 remains 66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3. Rules, policies, corrected-search default and Socket.IO contracts are unchanged; no dependencies added.

Official-engine corpus replay passes. Training without annotations exits 2, reports missing supervision and writes no weights. Feature validation/vectorization only: 320 samples, p50 0.0551 ms, p95 0.0921 ms, max 0.7384 ms; this is not search or concurrent-room latency.

## Limitations / review gates

Need qualified human expert annotations with independent validation before trained-model evaluation. Sequence-model need, calibrated V3 search integration, self-play, component ablations, fresh >=1,000 paired-deal tournaments per opponent and 8/16/32-room load tests remain blocked. No V3 alias is registered and model/tournament/policy-latency metrics are null. Do not interpret privacy/numerical software tests or descriptive collection coverage as evidence supporting the expert strategy hypotheses.

See docs/AI_V3_EVALUATION.md, docs/AI_V3_EVALUATION_PLAN.md and benchmarks/ai-v3-foundation-results.json. Keep this PR a draft pending expert data and independent review. Do not merge or promote.
