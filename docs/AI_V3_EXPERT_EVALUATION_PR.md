## Blind expert evaluation on the reveal-eligibility fix

Stacked on `fix/rung-reveal-eligibility`; target that branch initially. Adds a separate token-authenticated loopback Express interface for real seeded engine positions. Experts see strict observable inputs, save legal choices/reasons/uncertainty, then compare with actual configured V2 actions. V3 clearly shows Not available. No gameplay UI, production policy, checkpoint, scoring or runtime socket contract changes.

Reuses V3 corpus/observation/import contracts. Adds optional mixed forced/voluntary calling during collection, deterministic replay, one view per complete deal, disjoint source-policy/deal splits, atomic persistent revision history, idempotent retries and server-side validation. Tokens determine identity; no client hidden state is accepted. Seeds, private source ledger and predictions are withheld before submission. Later AI-exposed revisions are retained but excluded from independent evaluation and training-compatible export. No expert labels or confidence values are invented; no model is trained.

Reports agreement/disagreement by phase, reveal/control, principle and split; ranking metrics are conditional on actually provided alternatives. Offline fixed-work prediction metadata records actual diagnostics rather than invented reasoning. V2 configuration is intentionally recorded and differs from unrestricted live private-information handling; no general strength claim.

Validation: 114 focused tests / 9 files pass; both TypeScript checks, knowledge validator and client JS syntax pass. Real preparation/export and existing V3 corpus replay/status checks pass. Sample: 12 cases / 12 deals, zero human labels; actual technical skip and null-metric report are committed. Canonical checkpoint SHA256 unchanged.

See docs/AI_V3_EXPERT_EVALUATION.md for startup/storage and docs/AI_V3_EXPERT_EVALUATION_RESULTS.md for measurements and limitations. Rare Ace contexts need wider collection; manual browser usability review and human annotations remain outstanding. Keep separate from the engine fix, review before merge, and do not claim V3 learning or improved playing strength.
