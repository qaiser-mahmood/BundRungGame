# Interactive expert evaluation (no model training)

This stacked change builds on `fix/rung-reveal-eligibility`. It is a separate, authenticated local Express interface using the official engine, V3 observations, corpus splits and annotation importer. It neither changes the production application nor registers a V3 policy. Start commands run from the repository root.

## Prepare a private assignment

```sh
npm run expert:review -- prepare --data .expert-review/session-01 --seed 2200000 --deals-per-split 4 --source-commit FULL_CURRENT_40_CHARACTER_GIT_COMMIT
```

Get the source commit with `git rev-parse HEAD`; run from that version. The explicit source value is an operator provenance assertion, verified by replay, not authentication of expertise or code. Preparation refuses existing output directories. It bounds small collections to 1–30 deals per split and computes predictions offline. Never use a model directory as output.

The default example collects 12 initial deals with 12 candidate snapshots per trajectory; the blind assignment picks exactly one snapshot per whole deal. Mixed calling alternates ordinary heuristic setup with an official three-pass/forced-dealer declaration sequence. Low/high/random legal source families are disjoint across train/validation/holdout. None are expert teachers. All cards and transitions come from the authoritative engine; narrative examples are never filled in to make deals.

Card decisions can cover early/middle/late phases, positions, hidden/revealed rung, caller sides, public voids, Ace history, own strength and individual streak context. Coverage depends on the sampled deals: a small assignment does not guarantee every strategic pattern or rare late-game threat. Public observations supply counting/history, while suspected shortages and intentions must be supplied as uncertain expert interpretations. Reveal requests are forced legal transitions, not card-selection labels; cases can show the post-reveal context and count of preceding public reveal opportunities. This UI does not collect alternative reveal decisions or forced concealed locked-card plays.

## Start the review interface

Configure one stable opaque annotator ID and a distinct random token of at least 32 characters per expert. Generate tokens using a trusted password generator or `openssl rand -hex 32`. Set the environment variable locally; do not commit it or put tokens in URLs:

```sh
export EXPERT_REVIEW_USERS='{"expert_A":"REPLACE_WITH_A_RANDOM_TOKEN_OF_AT_LEAST_32_CHARACTERS"}'
npm run expert:review -- serve --data .expert-review/session-01 --port 4318
```

Open **http://127.0.0.1:4318** and enter the personal token. The server binds only loopback and refuses missing, weak or duplicate user tokens. For remote expert work, the operator must provide an authenticated, trusted access method separately; do not expose the port publicly. No proxy/firewall/security settings are changed by this code. The HTML shell has no case data; every API requires the bearer token. Tokens remain in tab session storage until Lock/tab closure. No CORS is enabled; foreign-origin API requests are rejected. Expert identity comes from the configured token, never the body.

Review own cards, current/public history, caller/forced status, reveal visibility, score/streak and conservative public voids. Choose one legal card, optionally rank alternatives (tied groups per line), explain it, identify signals/uncertainty and relevant knowledge principles. Confidence is optional and never prefilled. Choose ambiguous, insufficient or skip when appropriate; use Clear card selection when abstaining. Save and compare, then Next. Refresh restores saved decisions. Unsaved form edits are not persisted.

Before submission, neither API nor client receives AI actions, source seeds, split labels, hidden opponent hands or undisclosed trump. After a saved non-skip review, comparison shows actual policy/version/diagnostics and agreement. AI reasoning is not fabricated. A skip does not unlock comparison. Other experts' reviews are inaccessible. Exactly one view per initial deal avoids future/alternate-player contamination within an assignment.

## Policies and reproducibility

V2 calls the existing `decideV2` controller with 8 ISMCTS iterations, 4 particles, 128 nodes, control rollouts, adaptive allocation and exact solving disabled. All RNG inputs are seeded and deadline is Infinity during **offline preparation** for fixed-work reproducibility; work still has bounded iterations/nodes/rollout plies. This is a recorded V2 configuration, not a strength claim about all V2 configurations. Actual search fallback/counters and elapsed milliseconds are stored. No canonical neural model is loaded.

Both expert inputs and V2 preparation omit undisclosed trump, inspected partner hands and private concealed memories. This stricter boundary differs from some legitimately available caller/private-inspection information in live V2 and is recorded in diagnostics. No live policy behavior changes. Publicly revealed hands remain legitimate visible information. V3 is `not_available`, with a null action: there is no validated trained V3 policy to compare. The offline untrained baseline scaffold is not presented as an operational model.

Corpus verification and preparation replay the same official setup/trajectory to match each observation hash before predicting. Repeating a configuration reproduces positions and seeded actions; wall-clock latency, timestamps and annotation IDs are measurements, not deterministic fields. Keep configuration/source commit and the private bundle for audit.

## Storage, revisions and future training

Private directory contents:

- `collection-coverage.json`: descriptive coverage counts for the actual blind assignment; zero categories are not implied covered.
- `bundle.json`: entire source corpus/seed ledger plus frozen predictions. **Curator-only**; never share with annotators. Directory/file permissions are restricted by the CLI.
- `reviews.json`: atomically replaced snapshot retaining every annotation revision; private mode 0600. Contains seed/replay reference, observation/manifest hashes, actor, legal actions, expert fields, predictions/versions, timestamp, split and provenance links.
- `writer.lock`: single review-server writer. Normal termination removes it. After an abnormal crash, verify no old server remains before manually removing a stale lock. Do not run another writer or change bundles under a running service. Back up the private directory.

Retries with the same request ID and body are idempotent; conflicting retries or stale expected revisions are rejected. Corrections append revisions, never erase old labels. Any previous non-skip submission conservatively counts as AI exposure; subsequent revisions are marked non-blind even if the response was lost. Reports use independent first blind reviewed decisions, not post-comparison revisions. Skips can be revisited without false exposure.

The review envelope adds workflow metadata around the **existing** `Annotation` contract. Reviewed actions with an explicitly provided confidence produce legal-masked ranked annotations; no latent intention label is generated from narrative signal text. Without confidence, or for ambiguous/insufficient/skip cases, no training annotation is manufactured. The decision remains stored and can still contribute to descriptive agreement if reviewed. Optional ranking is partial: unmentioned legal cards remain incomparable.

Curator export (exclusive new output file, not an API endpoint):

```sh
npm run expert:review -- export --data .expert-review/session-01 --output /tmp/review-export.json
```

Export includes all review revisions, a report and an `AcceptedDataset` from the existing V3 importer. Only independent blind reviewed labels with actual confidence are exported as training-compatible records; AI-exposed revisions are retained for audit but excluded. Training/validation/holdout metadata remains intact. Existing V3 training row preparation must select train/validation and must never fit holdout. No training is performed here.

Use stable identities and **one curator-controlled corpus per study**. Do not give experts seeds, private bundles, alternate offsets or overlapping new sessions from the same deals. Split integrity is enforced within the manifest; cross-study overlap must be checked by curator deal keys before combining corpora. Experts are self-declared; authentication does not establish qualification. The tool cannot prevent an expert independently reconstructing a deal outside the controlled workflow.

## Reports and evidence

The My report API reports only the authenticated expert's records. Curator export aggregates experts. Phase buckets are tricks 1–4 (early), 5–9 (middle) and 10–13 (late), for reporting only. Reports contain reviewed counts, agreement/disagreement counts, top-ranked agreement, conditional top-two-rank-tier hits (including ties) where rankings genuinely support comparison, phase/reveal/control/principle groups and separate split groups. Public concealed current plays make control unknown instead of guessing a winner. Revisions/status counts are explicitly distinct from independent decision counts. Overall descriptive counts combine splits; only the separately frozen holdout group can support future independent model evaluation. Never tune to holdout reports.

No expert labels have yet been collected. No statistical intervals, learned-strength claims, tournament results or model training results are invented. Conditional ranking scores are not complete-action accuracy. Sample artifacts below are an actual skipped technical smoke record with no action/confidence/label, and a real empty-report output; they are not expert demonstrations.

Focused results and example artifact paths are recorded in `AI_V3_EXPERT_EVALUATION_RESULTS.md`. Next steps: curate broader coverage, qualify experts, collect independent rankings with counterexamples, audit disagreement and split provenance, then perform offline baseline fitting/calibration and fresh held-out evaluation under the existing V3 gates.
