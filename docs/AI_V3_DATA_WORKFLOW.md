# V3 expert teaching workflow and data contract

Authoritative contract: [AI_V3_PARTNERSHIP_LEARNING_SPEC.md](AI_V3_PARTNERSHIP_LEARNING_SPEC.md).

## Current gate

Stage A (observable features, official-engine packet generation, blind expert assignments, annotation validation, privacy/split tests) is implemented. Offline interpretable baseline **scaffolding** is implemented and tested numerically. No expert dataset was supplied or found. Existing `train_expert_imitation.ts` selects the heuristic bot as teacher; it is not a human demonstration dataset or a validated intent teacher.

Therefore baseline model quality, sequence-model need, V3 search integration and self-play are not established. `ai-v3-partnership` is deliberately **not registered as a policy alias**: relabelling V2 as trained V3 and benchmarking it would be misleading. `corrected-search` remains default; all existing policies and checkpoints are unchanged.

## Inputs and strategic memory

`observeDecision` reconstructs a hand's complete observable history per snapshot. There is no private cross-observer/room cache to reset. Relative seat 0 is always the observer; remaining seats follow authoritative turn order. Packet inputs exclude original player names/IDs, room IDs, timestamps, toss cards from the separate deck, status strings, redundant previous/winning-card aliases, private inspected hands, and concealed opponent card identities. Visible history, public void proofs, ordinary own cards, legal masks, public disclosures, suit counts, own/high-unlocated card counts, preceding partner wins/leads, repetitions, caller/team/reveal/modifier/streak/scoring context are versioned.

V3 conservatively omits **unrevealed trump identity/suit even for its caller**. The last concealed locked-card forced play is not an annotation/model decision: its mask would reveal that identity, so it is handled only by authoritative rules and skipped by the generator. This does not alter legitimate client visibility or gameplay. Legitimate deductions from public counting remain possible; the extractor never reads a hidden opponent hand or supplies the private secret-trump field. Unknown historical reveal provenance stays null, not an invented boolean.

`FEATURE_NAMES`, feature schema/version, card index order and head dimensions bind checkpoints. Counts/strengths describe observations, not assertions that a low lead *means* a particular action. No signal-to-card mapping is implemented.

## Generate and verify

```sh
npm run v3:data -- generate --seed 1200000 --train-deals 8 --validation-deals 4 --holdout-deals 4 --positions 4 --source-commit FULL_40_CHARACTER_SOURCE_COMMIT --output /tmp/v3-expert-corpus
npm run v3:data -- verify --corpus /tmp/v3-expert-corpus
npm run v3:audit-data -- /tmp/v3-expert-corpus /tmp/v3-data-audit.json
```

The engine, not hand-written scenarios, generates reachable positions and legal cards. Deterministic low-card, high-card and seeded-random play provide different **nonexpert** source styles. Automatic setup/challenge/reveal actions use the existing engine. No heuristic chosen action is copied into an expert ranking or intent label.

`private/packets.json` holds all candidate snapshots; `private/manifest.json` contains seeds, source commit, initial-deal grouping hashes, opponent style, split and packet integrity hashes. The model never receives that metadata. The generator makes policy families and complete initial deals disjoint across train, validation and frozen holdout; exact observable aliases cannot cross splits. `verify` replays the current official engine from the manifest configuration, not just its JSON hashes. Source commit is an operator-provided provenance assertion; run from/review the named version. SHA256 integrity is not authentication of human expertise.

`public/` is a **blind assignment**, not the full corpus: one snapshot per initial deal, with matching unfilled templates and public card/label format. Different snapshots can contain different observers' ordinary hands or future actions. **Never give annotators the private corpus, seeds, split/style ledger, or future/other-player views from the same deal.** Import rejects a stable annotator ID labelling more than one packet from a deal, including across batches/revisions. This is a workflow safeguard, not access control over files copied by the curator.

## Assign experts and annotate

```sh
npm run v3:data -- assign --corpus /tmp/v3-expert-corpus --annotator expert_A --position-offset 0 --output /tmp/v3-assignment-A
npm run v3:data -- assign --corpus /tmp/v3-expert-corpus --annotator expert_B --position-offset 0 --output /tmp/v3-assignment-B
```

Same offset gives both experts the same cases for disagreement analysis. Other offsets give alternate decisions to **different experts/cohorts**, never to someone who already saw that deal. IDs must remain stable per actual annotator. Share only the assignment directories. The sample corpus is a workflow demonstration, far too small for a strength claim.

To inspect one safe view as curator:

```sh
npm run v3:data -- render --corpus /tmp/v3-expert-corpus --packet PACKET_ID --output /tmp/observable-decision.md
```

Experts edit `annotation-template.json`:

1. Set their opaque stable `annotatorId`; change provenance kind from `unfilled-template` to `human-expert`. Qualification is `self-declared` or externally `reviewed`. The tool cannot establish credentials; keep an independent reviewer record.
2. Preserve `manifestHash`, `packetId`, `observationHash` and card index mapping. Provide a positive integer revision. Corrections increment it.
3. Rank **legal** action indices in ordered groups: `[[best],[nextA,nextB],[lessPreferred]]` supports ties. Complete coverage must include every legal card once. Partial coverage leaves unmentioned cards incomparable; training does not invent negatives for them.
4. Supply action confidence in [0,1] and a nonempty explanation. An empty ranking with zero action confidence and reasoning records an abstention or latent-only annotation; it is not a card target.
5. Fill only latent beliefs the expert can justify; leave unknown labels **null**. Explicit probabilities retain ambiguity; confidence and rationale are separate from the probability distribution. No shortage/intention is prefilled.

Label categories (also in `card-and-label-format.json`):

| Label | Meaning / ordered classes |
| --- | --- |
| Partner shortage, each suit | Current held count: VOID, SINGLETON, TWO_PLUS; include a possible locked slot in uncertainty |
| Intended return suit | HEARTS, DIAMONDS, CLUBS, SPADES, NO_REQUEST |
| Desired lead control | PARTNER_RETAIN, OBSERVER_TAKE, NO_PREFERENCE |
| Primary strategy phase | FORCE_REVEAL, PRESERVE_CONCEALMENT, LEAD_CONTROL, INDIVIDUAL_STREAK, ENDGAME, OTHER |

These are **expert beliefs at the current decision**, not objective access to a simulated partner's mind. `NO_REQUEST` is a positive judgment; null means unknown. `basis: expert-belief` is appropriate for generated bot trajectories. `partner-self-report` is reserved and rejected here because no human-play trajectory importer exists yet. Ground-truth hidden suit counts may later be separate training-only auxiliary labels, but cannot become inferred intent labels or inference features.

Examples in [AI_V3_HYPOTHESES.md](AI_V3_HYPOTHESES.md) are hypotheses and counterexamples, not demonstrations or legal game fixtures.

## Import, disagreement and label integrity

```sh
npm run v3:data -- import --corpus /tmp/v3-expert-corpus --annotations /tmp/expert-A.json,/tmp/expert-B.json --output /tmp/v3-accepted
npm run v3:data -- status --corpus /tmp/v3-expert-corpus --annotations /tmp/v3-accepted/annotations.json
```

Unfilled templates, illegal/repeated actions, incomplete complete rankings, mismatched observation/source hashes, contradictory same-revision edits, impossible public-void/disclosure labels and invented human self-reports are rejected. Identical imports are idempotent; all explicit revisions remain auditable, with the latest revision used for training. Multiple experts are retained separately. Reports show top-tier overlap, contradictory common ranked pairs and latent probability distances; they do not silently replace disagreement with a majority truth. Partial rankings may be incomparable.

Generation and import refuse existing output directories. Hashes use canonical object-key order and preserve chronological array order. Exported features are recomputed and checked; split/deal/observation/policy provenance is revalidated before rows enter training.

## Baseline scaffolding and future gates

```sh
npm run v3:train -- --corpus /tmp/v3-expert-corpus --annotations /tmp/v3-accepted/annotations.json --output server/ai/models/experiments/v3/baseline.json --report /tmp/v3-baseline-report.json
```

Without actual train **and independent validation** labels, the command exits **2**, returns explicit blockers/null model metrics and writes no checkpoint. Synthetic numerical unit fixtures are not imported or reported as expert demonstrations.

Regularized multinomial heads support soft targets, confidence weights, clipped inverse-frequency class balancing, masked card alternatives, validation-only temperature selection, Brier/log loss/ECE, uniform comparison and abstention. Metrics score expert distributions; they do not prove objective intention prediction. Partial card-ranking metrics are conditional on annotated alternatives, not complete-action accuracy. Class balancing changes the fitting objective; proper validation scores must reveal any resulting calibration harm. No model is cleared for search merely because a fitting command completes.

Checkpoints are strict, hashed and atomically written under `server/ai/models/experiments/v3/` only; symlink traversal, incompatible feature/card/head schemas, corrupt payloads, different resume provenance and canonical overwrite are rejected. Resume requires identical corpus and annotation hashes. They remain marked `experimental-not-cleared-for-search`.

No sequence model is added until a prespecified, adequately annotated order-sensitive suite shows the simpler baseline is insufficient. Search integration/ablations and controlled self-play follow supervised validation and independent review, not untrained placeholder predictions. Future tests must compare real expert-play baselines, diverse opponents/partners, equal work and actual CPU, >=1,000 fresh paired held-out deals against corrected-search and V2, and 8/16/32-room p50/p95/max decision/queue latency, deadlines, fallbacks and official scores. See [AI_V3_EVALUATION.md](AI_V3_EVALUATION.md) for current evidence and explicit blockers.
