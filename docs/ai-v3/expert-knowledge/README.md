# Expert strategy knowledge, version 1.0.0

This package preserves the human expert's supplied strategies, corrections and uncertainty. It is documentation and interview material, **not a gameplay policy or training dataset**. No action probabilities or numerical expert confidence have been invented.

The source is [the user's consolidated discussion summary](expert-source.md), preserved verbatim with a SHA256 binding. Original question-by-question transcripts and complete game snapshots were not provided. Quotations and section references point to that summary; they do not claim independent access to earlier interviews. Source sections A–N and six corrections are covered. `SC-*` IDs are editorial identifiers, not recovered original scenario numbers; only Scenario 21 has a supplied discussion number.

- [Consolidated strategy guide](AI_V3_EXPERT_KNOWLEDGE.md)
- [Versioned principles and rejected interpretations](expert-principles.json)
- [Narrative scenarios](scenario-examples.json)
- [Corrections and unresolved questions](corrections-and-ambiguities.md)
- [JSON Schema](knowledge-schema.json)
- [Interview template](interview-template.json)

## Evidence and provenance

The primary source is a user-supplied **consolidated summary**, not independently verified original expert speech. Each `evidence.quote` is an exact excerpt of that summary; `sourceId` in scenarios resolves to the source record in `expert-principles.json`. Preferred actions, reasons, benefits, caveats and scenario responses are editorial paraphrases of the supplied material, not newly authenticated quotations. Engine findings are separately attributed through `mechanicVerification` and [the engine review](ENGINE_REVIEW.md). Editorial legality/privacy cautions are not additional expert demonstrations.

SHA256 verifies that source bytes match the recorded file; it does **not** establish factual correctness, expertise, authorship or original-transcript provenance. The supplied `expert-source.md` wording is preserved unchanged. No original scenario numbers beyond 21 or numerical confidence scores have been recovered or invented.

## Classification and trust

Every principle has a stable ID, category/phase, preconditions, preferred action, reasoning, intended benefit, exceptions, qualitative certainty, evidence, cross-references and open questions. Benefits are intended effects, not measured outcomes. `verified_game_mechanic` is reserved for findings checked in the official engine, with path/symbol/line anchors and source commit. The other classes are `expert_strategic_preference`, `probabilistic_inference`, `conditional_exception` and `unverified_hypothesis`. A schema accepting these categories does not establish their truth.

All 20 scenarios are `narrative_only`. Unknown caller, position, trump, history and remaining cards stay unknown/null. Listed own cards are the supplied subset, not asserted complete hands. `currentTrick` records supplied card/role premises; it is not a reconstructed full chronological trick, except where the source explicitly provides order. Confirmed voids are labelled narrative premises with missing public proof, not engine-verified observations. Suspected shortages never become confirmed voids. No concealed opponent holdings are included as known facts. None of these narratives may be fed directly into V3 training.

## Extend through interviews

Copy `interview-template.json`; retain stable IDs for corrections and supply a source reference. Record exact own/public cards, their order, turn, caller/forced status, reveal state, proven voids, uncertain shortages, chosen action, alternatives, reasons, exceptions and expressed confidence separately. Leave unanswered fields null/empty. Capture missing information instead of guessing. Interview sheets are scratch records; a curator must reconcile them into validated principles/scenarios. Only a genuine complete observable packet may populate `observationPacketId`.

Scenario 21 is unanswered: post-reveal strategy with diamonds as trump. No response, selected card, alternatives or invented reasoning is supplied.

Maintain semantic versions: patch for spelling/anchors, minor for additive knowledge/corrections, major for incompatible schema semantics. Never reuse an ID. To retire a principle, set `superseded`, point to active replacements, update correction references and preserve evidence. Rejected statements live only in the correction ledger, not as active principles. Document and source future expert revisions; do not silently resolve conflicts.

## Contribution checklist

For each new response, first check whether it supports an existing principle. Attach evidence to that principle when it clarifies existing reasoning. If it contradicts prior knowledge, preserve the correction and supersession history rather than silently editing away the earlier claim. Create a new principle only for genuinely distinct reasoning, not another example of the same preference. Preserve unresolved uncertainty and never manufacture a complete observable state from narrative details. Keep the interview template as a collection aid, not an interview application or a training-data importer.

## Validation and scope

```sh
npm run validate:expert-knowledge
npx vitest run __tests__/ExpertKnowledge.test.ts
npm run typecheck:ai
```

The dependency-free validator implements the [documented restricted subset](SCHEMA_VALIDATION.md), not full JSON Schema compliance. It preflights every schema branch/definition before inspecting data and fails on unsupported keywords or malformed schemas. No established validator is a direct project dependency; adding Ajv solely for this small offline package was not necessary for the bounded subset. It checks shape/enums/IDs, source hashes and literal quotes, references, active/superseded consistency, mechanic evidence, missing observations, public-only structured card fields and Scenario 21's unanswered state. Automated validation cannot establish expert credentials, prove every prose sentence true, verify a narrative's reachability or replace human review. Schema additions require matching interpreter support and tests.

## Existing V3 pipeline

Use these principles to choose interview topics, design counterexamples, propose observable features and evaluate future expert rankings. Do not turn them into deterministic signal-to-card rules. For actual supervised data, generate/replay reachable packets through [the existing V3 workflow](../../AI_V3_DATA_WORKFLOW.md), give experts blind views, obtain ranked **legal** alternatives and probabilistic beliefs with genuine provenance, then import using the existing validator. A narrative selected card is not a legal-action label without that snapshot. Complete-deal/opponent-family splits and held-out evaluation still apply. No training/runtime integration is performed here.
