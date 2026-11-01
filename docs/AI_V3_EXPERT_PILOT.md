# First 15 expert reviews: local owner pilot

This is a collection pilot, not AI training. Start from `feature/ai-v3-expert-pilot` (based on V3 with PR #7 merged). Production gameplay/defaults and the canonical model are unchanged. V3 remains **Not available**; recorded V2 decisions are comparisons only after the expert saves. V2 may use its existing legal fallback on difficult frames; that actual flag is shown and is not represented as a completed search. This pilot does not repair or claim strength for that baseline.

## What is prepared

`prepare-pilot` generates a bounded official-engine pool, then selects exactly 15 distinct initial deals, one observer snapshot per deal. Default pool: 15 train + 15 validation + 15 holdout deals, up to 52 genuine multi-choice snapshots each. Source-policy families remain split-disjoint. Existing corpora and export contracts are preserved. Every selected frame is replay-matched before its frozen AI comparison is computed. No narrative cards/history or expert labels are synthesized.

The deterministic `targeted-expert-pilot/v1` selector balances five early (tricks 1–4), five middle (5–9), five late (10–13), five cases per split and at most four cases per playing position. It favors unmet rare public-context targets, never AI disagreement or future game outcomes. It permits at most five binary-choice cases and targets at least ten cases with three or more legal cards. This is a difficulty proxy, not a claim that every situation is difficult.

Coverage also targets hidden/revealed rung, actual forced/voluntary declaration, partner/opponent currently winning, own suit strength/weakness, public voids, current/past Ace downgrade, a possible subsequent Ace lead downgrade, eligible individual opponent streak contexts and partner-control choices. Strong-suit proxy: at least two own cards including Q/K/A; weak-suit proxy: a nonempty own suit with highest rank <=9. These overlapping **collection tags are not strategies, intent labels or recommendations**. Partner-control tags do not assert the expert should always play low.

Targets, counts and shortfalls go in `collection-coverage.json`. Missing rare categories are explicit, never filled with invented states. If 15 distinct balanced deals cannot be selected, preparation stops with `PILOT_COVERAGE_POOL_INSUFFICIENT`; before any collection, choose a larger pool (maximum 30 deals per split) or a fresh seed/new directory. If a 15-case plan has shortfalls, `readyForPilot` is false and the owner should inspect the report before starting. Do not alter/reprepare an existing reviewed assignment.

The proposed reproducible cohort uses seed **3100000**, 45 source deals and 15 selected cases. A public coverage summary is in `benchmarks/ai-v3-expert-pilot-coverage.json`; private frames, seeds and the selected-ID ledger are not served to reviewers. Published fixture/configuration is for curator verification; for an expert who has inspected those source details, generate a fresh private cohort and check its coverage rather than treating it as blind.

## Windows PowerShell: exact first setup

Requires Git, Node.js 20.6+ (Node 22 LTS recommended), npm and a current Edge/Chrome/Firefox. Run from the repository root, with any existing work committed or stashed before switching branches. No PowerShell execution-policy changes are needed: these are interactive commands, not an unsigned script.

```powershell
git fetch origin
git switch feature/ai-v3-expert-pilot
npm ci
$PilotCommit = (git rev-parse HEAD).Trim()
npm run expert:review -- prepare-pilot --data .expert-review/pilot-01 --seed 3100000 --source-commit $PilotCommit
```

Check that preparation reports 15 assigned cases and `readyForPilot: true`. Inspect **counts/shortfalls only**, not the private `bundle.json`, before independently choosing cards. For a fresh seed, replace the seed number and use a new directory; a single manifest isolates the study's train/validation/holdout deals.

Create a stable private owner identity and token **once** (no token printed to the console):

```powershell
npm run expert:review -- init-access --data .expert-review/pilot-01
$PilotOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls ".expert-review\pilot-01" /inheritance:r /grant:r "${PilotOwner}:(OI)(CI)F" /T
$PilotAccess = Get-Content -Raw -LiteralPath ".expert-review\pilot-01\users.local.json" | ConvertFrom-Json
Set-Clipboard -Value $PilotAccess.pilot_owner
npm run expert:review -- serve --data .expert-review/pilot-01 --users-file .expert-review/pilot-01/users.local.json --port 4318
```

Open **http://127.0.0.1:4318**, paste the token and open the assignment. Clear the clipboard after login (in another PowerShell window if desired: `Set-Clipboard -Value ""`). The private ACL command applies only to this application's data directory. If organizational filesystem policy prevents it, use an owner-only local folder and seek appropriate local support; do not disable protections. Do not share/commit `users.local.json` or the data directory. It is git-ignored. Do not paste the token into chat, URLs or screenshots.

The service binds **127.0.0.1 only**, authenticates every data API and does not publish a public interface. Windows file modes alone do not establish private ACLs, hence the owner-only ACL step above. Do not enable port forwarding or public hosting for this pilot.

## Reviewing the 15 cases

The page shows all ordinary/publicly revealed own cards, legal options, partner/opponent relative seats and current chronological playing order. Current trick and previous tricks are separated; a publicly determinable winning card and downgraded effective strength are shown. Unknown/concealed cards stay unknown. Public void proofs, counts, dealer score and qualifying individual streaks are shown.

Bidding information is a **public status summary** (caller, forcedness, preceding pass count and per-seat final status), not an invented full auction transcript. A separately locked hidden card and undisclosed trump are omitted under the existing strict V3 observer boundary, even if the caller knows them in live play. Legitimately public revealed hands remain visible.

1. Select a preferred legal card. No choice/confidence/AI answer is prefilled.
2. Optionally use Add as next rank or edit ranked groups (card IDs, comma-separated ties, one group per line). Unmentioned alternatives remain incomparable.
3. Explain the decision; distinguish observed partner signals from uncertain deductions. Supply confidence only if you intend to do so.
4. Mark ambiguous/insufficient with a reason or uncertainty explanation, or clear choices and skip. No forced label is generated.
5. **Save and compare**. The server validates the legal mask and durably records the revision before returning AI comparisons. The next case remains blind.
6. Continue with Next. The progress indicator and picker distinguish Not reviewed, Completed decision, Skipped, Ambiguous and Insufficient information. Skips and unresolved answers are never counted as completed decisions. There are exactly 15 assigned cases.

Navigation is disabled during requests so an old response cannot overwrite a different case. Unsaved edits prompt before leaving; only saved decisions are durable. Reopened cases restore saved values, not AI recommendations. Later corrections are retained, but cannot replace the first independent decision in metrics/training export. No confidence is borrowed from an AI-exposed revision. A skip can be revisited; an ambiguous/insufficient non-skip response has already unlocked comparison and cannot later become an independent label.

## Stop and resume safely

Wait for the Saved message, then stop the server with **Ctrl+C**. In a new PowerShell window at the same repository/version, run only:

```powershell
npm run expert:review -- serve --data .expert-review/pilot-01 --users-file .expert-review/pilot-01/users.local.json --port 4318
```

Use the same token from the same private file (copy it again using the `Get-Content`/`Set-Clipboard` commands above). Login resumes at the first untouched case, based on server records, including after browser refresh or application restart. Use the picker to revisit a saved or skipped case. If all 15 have been visited, the page shows separate totals for completed decisions, skips, ambiguous and insufficient answers; it does not claim 15 completed decisions. The full picker remains available. Reopening a saved non-skip answer reads its existing comparison without creating another submission. A skipped case may later receive a genuine decision without losing its original revision or unlocking AI early.

**Do not rerun preparation, delete reviews.json, change the bundle or recreate credentials to resume.** Preparation refuses existing directories and access initialization refuses overwriting a token. Keep the same annotator identity. Back up the entire private directory with the server stopped. `reviews.json` retains every revision; frozen inputs/predictions live in `bundle.json`. POSIX private file modes are set; Windows uses the ACL step above.

After an abnormal crash, `writer.lock` may remain. Read only that file's PID and use `Get-Process -Id PID` to verify the old server is gone before deleting that specific lock. Never remove a lock from a running server. A second server writer is rejected; startup acquires the lock before loading records, avoiding stale writer snapshots. If port 4318 is occupied, stop the conflicting local process or choose another explicit local port.

## If a save response is lost

The exact request ID and JSON payload are written to this browser's local storage **before** sending. No token is stored in that pending journal. While the outcome is uncertain, fields and navigation are blocked; retyping or double-clicking cannot start another request. On refresh/login the pending case is reopened first and an authenticated lookup checks only that same reviewer/case/request ID.

- If the server saved it, the original revision and its comparison are restored; no second POST is needed.
- If absent, use **Retry original request**. This sends the same request ID and exact frozen payload, never a freshly assembled decision. The server's idempotency/revision guards still apply.
- If lookup fails, use **Check save outcome** later; the pending journal stays intact. Do not clear it or create a new assignment as a recovery shortcut.
- A named pre-save validation/revision rejection is shown separately. It cannot overwrite existing history; the latest server copy is reloaded before a new explicit submission, and the rejected draft is shown read-only for copying notes. Server errors after persistence are treated as uncertain, not as proof the save failed.

Use the same browser profile and **exact URL** (host/port) until a pending save is resolved. Browser-local pending intent cannot survive clearing site storage, private-mode closure or switching profiles/origins. Saved server decisions remain durable independently. Keep one review tab open; concurrent tabs remain protected by server revisions, but use refresh/reconciliation if a journal-change warning appears. If local storage is unavailable/full, the client refuses to send a new save rather than risk losing its request identity. Close/reopen or Lock retains unresolved pending intent; authenticate with the same reviewer identity to recover it.

## Export and data quality review

After the session, with the same original directory:

```powershell
npm run expert:review -- export --data .expert-review/pilot-01 --output .expert-review/pilot-01/session-export.json --training-dir .expert-review/pilot-01/canonical-export
```

These are **new** output paths. Export preserves V3 `AcceptedDataset` and canonical corpus layout, all revision history, original legal sets, provenance and frozen policy identifiers. Only first independent reviewed actions with explicit confidence become training-compatible annotations; no model training is run. Keep holdout excluded from fitting/model selection. Do not combine overlapping or alternate-view studies under the same expert identity; cross-study overlap remains a curator responsibility.

For this first pilot, review missing rationales, abstentions, disagreement and confidence use with the expert. Fifteen curated cases are not a strength benchmark or statistically sufficient supervision. V3 remains unavailable. Broader independent annotation, calibration and fresh held-out evaluation are later work.

## Validation limits

Focused automated checks cover replay, plan integrity/shortfalls, unique deals/splits, legal actions, winner privacy, saved/revised labels, canonical exports, authentication and resume metadata. Manual Windows/browser usability has not been executed in the Linux Codex environment. No tournaments, heavy browser automation or training are part of this pilot.
