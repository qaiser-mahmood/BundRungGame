# Preserve the 14 reviews: caller-private information repair

**Existing owners must migrate their original directory. Do not run prepare/prepare-pilot, delete reviews, replace the bundle, recreate the token or repeat unaffected cases. No upload is needed.** The command below determines the exact local count; Codex does not have the owner's Windows data and cannot truthfully state that count in advance.

## Engine findings and root cause

`BundRungEngine.submitBid` stores the selected card separately and retains its suit. `getPrivateState(playerId)` gives `secretTrumpSuit` and `myTrumpCard` only to the actual current caller. `getPublicState` continues concealing them before public reveal. `getLegalCardsForPlayer` independently excludes the locked card while hidden, except its last forced play when the ordinary hand is empty; after reveal, following suit and revealer-trump obligations still apply.

V3 v1 deliberately omitted caller knowledge in `Observation.ts`, and evaluation `restrictedPrivate` removed it from V2 inputs. That conservative historical boundary was wrong **for the caller**, though correct for non-callers. Relative seat 0 is the actor, not necessarily the caller. The repair uses actual engine IDs before mapping to relative seats.

## Versioned boundary, no game-rule changes

New CLI corpora use `bundrung-v3-annotation-corpus/v2`, `bundrung-v3-player-memory/v2` observations and `bundrung-v3-player-features/v2` (629 features). `callerPrivate` is present only for the acting caller, with selected suit, currently held locked-card identity and engine-derived playability. Own remembered concealed plays are actor-only. Public history remains public/redacted; no opponent concealed or future cards are inferred. Known is not playable: the legal mask is copied from the engine and never expanded from private knowledge.

The original v1 extractor, corpus configuration default and old feature/schema constants remain available **for exact legacy replay**. Old bundles/hashes/IDs are not converted in place. New learning inputs encode private caller knowledge, but the existing 519-input experimental baseline explicitly refuses the new feature schema; a compatible model must be deliberately implemented later. No model is trained or checkpoint changed here.

V2 evaluation now receives the legitimate acting caller suit/card and the actor's own concealed memories. No production V2/controller/search behavior is changed. The old restriction remains only for reconstructing historical comparisons. Migrated affected cases retain both original and corrected-information predictions. A changed action or agreement is not evidence of playing-strength improvement.

## Windows: stop, verified backup and migrate the existing pilot

Stop the local service with **Ctrl+C** and close/reload old interface tabs after updating. Do not remove an active writer lock. From the repository root in PowerShell:

```powershell
git fetch origin
git switch fix/ai-v3-caller-private-knowledge
npm ci
$CallerFixCommit = (git rev-parse HEAD).Trim()
npm run expert:review -- migrate-caller-knowledge --data .expert-review/pilot-01 --source-commit $CallerFixCommit
```

The command takes the existing exclusive writer lock, validates corpus/review integrity, and makes a SHA256-verified backup of the **entire original private directory**, including the personal token. Backup lives under `.expert-review/pilot-01/.caller-knowledge-backup/<inventory-hash>/`, inheriting that private directory's Windows ACL. No credentials are printed or uploaded. Symlinks/junctions are refused. Keep the original owner-only ACLs and back up this private directory securely.

Before activating anything, the command regenerates the original corpus **in memory** using the original configuration, checks the original manifest, then replays each original assigned frame and verifies its original observation hash, actor mapping and unchanged legal set. It writes a new `caller-private-audit.json`; it never writes `bundle.json`, `reviews.json`, `users.local.json` or source hashes. An unresolved replay writes evidence inside the verified backup and refuses activation. Do not guess a replacement hand or regenerate over the original.

Output lists each original case ID/hash as unaffected or requires_confirmation, and reports `affectedCases`, `requiresConfirmation` and quarantined counts from the real local records. Unaffected cases need no action. An affected but unreviewed case receives corrected information in normal review instead of a confirmation question.

Migration is idempotent: rerunning the command verifies the existing audit and original baseline records without creating new questions, rerunning V2 or changing timestamps. After normal new reviews append later, the audit still requires every original review record to remain identical. Original-file backups retain their exact bytes. Correction actions never write reviews.json; only normal later reviews use the existing append-by-atomic-snapshot store, retaining original records.

If a previous service crash left writer.lock, read its PID and confirm the old process is gone before removing only that stale lock. If validation fails, stop and inspect the local error/backup evidence; do not delete reviews or tokens. No remote private-data upload is required.

## Resume the same owner and answer only targeted questions

Use the **existing** token file and actor identity:

```powershell
npm run expert:review -- serve --data .expert-review/pilot-01 --users-file .expert-review/pilot-01/users.local.json --port 4318
```

Open the same browser/profile at **http://127.0.0.1:4318** and log in with the existing personal token. Do not run init-access. Any existing uncertain-save journal stays bound to the original assignment hash. Already saved old requests recover their original receipt with AI withheld when correction is pending. An unsaved old-boundary draft is explicitly rejected; it is never silently upgraded to a complete-information decision.

Click **Review caller-information corrections (N pending)**. This mode lists only affected saved decisions from that reviewer, using the original case IDs/order, not another 15-case assignment. It shows the original situation, restored caller information, original selection/reason/confidence, and asks:

> Knowing your trump suit and locked card, would you keep your original decision?

- **Keep original decision:** one explicit confirmation; original choice/reason/confidence are linked unchanged.
- **Change decision:** select a different legal card and optionally edit the prefilled reasoning/confidence, then Save. Original records are never replaced.

No V2 choice appears before this action. After durable confirmation, the page shows original V2, corrected-information V2, original expert and confirmed/corrected expert choices, with agreement changes. Both old/new AI predictions remain frozen with versions/diagnostics, including fallbacks. No reasoning is invented.

`caller-private-corrections.json` is a separate durable, revisioned, idempotent ledger. It records original review ID, both observation hashes, original audit hash, explicit keep/change, timestamp and conservative prior-AI-exposure provenance. Every correction is **not independent**, even a keep. Revisiting an already confirmed case says no repeat is required; another explicit action creates a linked ledger revision. Correction saves use the existing durable browser-journal/reconciliation workflow, so lost responses can be recovered after restart.

Return to normal review for the one remaining original case. If it was affected, it now displays the caller's own information; its first complete-information review is marked separately with the restored observation hash. It may be genuinely blind if no previous non-skip answer unlocked AI. This does not make an old, previously exposed correction blind.

## Safe export and quality review

Use new output paths inside the private directory:

```powershell
npm run expert:review -- export --data .expert-review/pilot-01 --output .expert-review/pilot-01/caller-correction-export.json --training-dir .expert-review/pilot-01/caller-correction-canonical
```

The export preserves every original review, exposes separate audit counts, correction ledger and before/after comparisons. It retains the existing `AcceptedDataset` format for unaffected eligible original blind labels. All affected legacy labels are quarantined from automatic training and independent agreement metrics, including confirmed/changed corrections and first complete-information reviews attached to an old v1 slot. The v1 corpus cannot safely encode their new private inputs; no implicit promotion/conversion policy is invented. Correction counts and provenance remain separate for deliberate later quality/training policy. Both training/holdout separation and the first-independent-review rules remain intact.

The migration/correction ledger is never itself treated as independent model-evaluation evidence. An explicit keep does not erase prior AI exposure. No new expert label is manufactured, and no affected original is automatically declared valid merely because the code changed.

## Limitations

Windows/manual browser usability must still be checked locally. Automated tests use engine-generated software fixtures, not the owner's 14 real labels. SHA256 establishes integrity, not human expertise or a cryptographic proof of source authorship. The supplied source commit is an operator provenance assertion. Corrected V2 may still use its existing fallback; actual diagnostics are retained. Pending browser intent requires the same origin/profile and intact storage. Serve remains loopback-only/authenticated. V3 remains unavailable, and all production rules/policies/checkpoints are unchanged.
