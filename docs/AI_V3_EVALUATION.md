# V3 implementation and evidence report

Stage A and offline baseline scaffolding are implemented. **A trained V3 policy is not complete.** No human expert annotations or validated intent teacher were supplied or found. Existing heuristic imitation is not expert evidence.

The [authoritative contract](AI_V3_PARTNERSHIP_LEARNING_SPEC.md) explicitly requires: “If expert labels are unavailable, complete A and implement training scaffolding, then explicitly request human labels instead of fabricating them.” Please have human experts annotate the blind assignment described below, or supply an existing expert dataset with provenance. This is the next required input.

| Deliverable | Result |
| --- | --- |
| Observable strategic memory and privacy tests | Implemented; 519 versioned features, public chronology, legal masks and uncertainty |
| Reachable seeded corpus and expert workflow | Implemented; blind assignment, revisions, disagreement and leakage validation |
| Shortage/intent/card baseline | Offline masked multinomial scaffolding with class balancing, calibration and proper metrics; no expert model trained |
| Sequence model | Not justified without a measured baseline failure |
| Optional V3 search integration | Blocked by supervised validity; no misleading V2 alias registered |
| Controlled self-play | Blocked by supervised validity |
| V3 tournaments, ablations, 8/16/32-room latency | Unavailable without a validated candidate; no strength claim |

## Reproducible collection fixture

[Corpus](examples/v3-expert-corpus/) contains 16 seeded initial deals, 64 reachable candidate decisions and a blind assignment of 16 decisions, one per deal. Training/validation/holdout contain 8/4/4 deals from disjoint lowest-legal/highest-legal/seeded-uniform source policies. These are **nonexpert collection trajectories**, not demonstrations. Accepted human annotations: zero.

Generator source commit: `8c24b2adc4c5906e2c13df4ddc470fabb3ce1346`. Manifest SHA256: `2f29d87fac94ac913ae429e1fdbaebf665692900382255a083c1558aef0597b4`. Official-engine replay verification passed. Commands, label semantics and expert assignment rules are in [AI_V3_DATA_WORKFLOW.md](AI_V3_DATA_WORKFLOW.md). Give experts only `public/`, never the private ledger, other-player views or future snapshots. Start with [the unfilled annotation template](examples/v3-expert-corpus/public/annotation-template.json); stable actual annotator identities and independent qualification review remain curator responsibilities. The sample is far too small for a strength claim.

Observable collection coverage among 64 candidate positions: low lead after partner win 19, high partner lead 9, repeated lead 12, ambiguous high-win/different-low-suit 8, our caller 42, opponent caller 22, revealed individual streak 16, unrevealed trump 36. These overlapping descriptive counts do not validate any expert intention or expected action. See [hypotheses and counterexamples](AI_V3_HYPOTHESES.md).

## Validation and negative results

Full suite: **285 tests across 30 files passed**, including existing rule parity and voice tests and 29 new V3 tests. V3 tests cover hidden-hand and hidden-trump swaps with prediction invariance, metadata contamination, concealment/Ace handling, schema and legal masks, deterministic replay, deal/policy split isolation, annotation provenance/revisions/disagreement, cross-view contamination, partial ranking targets, training gates and checkpoint safety. Numerical unit fixtures validate software, not expert playing ability.

Both TypeScript checks, production build and tactical checks are recorded in [machine-readable results](../benchmarks/ai-v3-foundation-results.json). The build retains its existing chunk-size advisory.

The real training CLI exits 2 with explicit missing-label blockers, null model metrics and **no checkpoint written**. No hidden suit counts are repurposed as intention labels. Unrevealed trump is conservatively omitted even for the caller; a concealed forced locked-card move is handled by official rules, not the annotation model.

Feature validation/vectorization microbenchmark: 320 samples, p50 0.0551 ms, p95 0.0921 ms, maximum 0.7384 ms. This excludes packet extraction, model inference, search, queueing and concurrent room load. It is not a live decision latency result. Model quality, tournament results and policy latency remain null, not zero.

The canonical checkpoint remains SHA256 `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`. Official rules, Socket.IO contracts, existing policies and corrected-search production default are unchanged. No new dependencies.

## Review recommendation

Review this as an expert-data foundation and offline training scaffold. Keep PR #4 a draft; do not promote a V3 policy or claim improved strength. Collect and independently review human annotations, enlarge the tiny sample, then follow [the prespecified evaluation plan](AI_V3_EVALUATION_PLAN.md). Human-play trajectory ingestion, actual intention self-reports, validated trained checkpoints, search integration and load/tournament gates remain future work.
