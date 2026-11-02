## Preserve expert discussion knowledge without changing gameplay

Adds a versioned expert knowledge package on top of the current V3 branch: 28 principles, 20 narrative-only scenarios, all six explicit corrections, a reusable interview template and a consolidated guide. Source quotations are bound to the supplied discussion summary; original transcripts and full game observations are not fabricated. Scenario 21 remains unanswered.

Separates engine-verified mechanics, contextual preferences, uncertain inferences and unresolved exceptions. Checks exact consecutive-lead Ace conditions, forced fourth-bidder declaration, following suit/locked-card caveat, reveal eligibility, same-individual opponent streak victory and official scoring. Updates the older hypothesis guide to reflect the later club-shortage and winning-partner clarifications; does not rewrite the V3 implementation contract.

Adds dependency-free JSON Schema and semantic validation for IDs, references, source integrity, corrections/supersession, incomplete observations, structured hidden-information claims and unanswered cases. Narrative card choices are not V3 training annotations; genuine observable packets and legal expert rankings are still required.

Validation: 22/22 focused knowledge tests, 34/34 existing targeted mechanics tests, schema CLI and AI TypeScript check pass. No expensive suites/training run. Production AI/default, game rules, scoring and canonical checkpoint remain unchanged; no new dependencies.

See docs/ai-v3/expert-knowledge/README.md, corrections-and-ambiguities.md and VALIDATION.md. No merge or runtime integration requested.


Final review corrections: preflight the entire supported schema subset, validate malformed schema structures, use structural JSON equality and Unicode string lengths, and reject unsupported constructs even in unused branches. Evidence provenance is centralized in the README; source-summary wording remains unchanged. Independent review of all six engine mechanics found the direct reveal-request eligibility gap, documented separately in ENGINE_REVIEW.md with a deterministic characterization test. No engine fix is bundled. Future contributions should clarify existing principles before adding distinct ones, preserving correction history and uncertainty.
