# Reproducible AI benchmarks

## Commands

Use the existing Node/npm installation and `npm ci` for locked dependencies.
From the repository root:

```sh
# Four games (two deals, policies exchange teams); default seed 1.
npm run benchmark:ai

# Persist complete machine-readable results (output must not already exist).
npm run benchmark:ai -- --seed 1 --pairs 20 --candidate production --output /tmp/production.json
npm run benchmark:ai -- --seed 1 --pairs 20 --candidate neural --output /tmp/neural.json

# Larger tournament: 2,000 single-hand games, 1,000 paired deals.
npm run benchmark:ai -- --seed 1000 --pairs 1000 --candidate production --output /tmp/tournament.json

# Symmetric baseline control.
npm run benchmark:ai -- --pairs 20 --candidate heuristic --baseline heuristic

npx tsc --noEmit
npm run typecheck:ai
npx vitest run __tests__/AIFoundationAudit.test.ts __tests__/AIBenchmark.test.ts
```

No new dependencies, browser, Socket.IO server, GPU or external service is needed.
The command uses `node --import tsx`, avoiding the tsx CLI's extra IPC listener.
The built-in `npm` banner precedes CLI stdout when invoked with `npm run`; for a
JSON-only stream use `node --import tsx scripts/ai-benchmark.ts ...` directly.
The explicit output file always contains only JSON. Existing policy diagnostic
logs go to stderr. A failed/aborted game or invalid move makes the CLI exit
nonzero; it never silently substitutes a different policy or counts an abort as
a win. Invalid CLI arguments fail. `--output` uses exclusive creation, preventing
replacement of existing files, including checkpoint symlinks. The canonical
model path is also explicitly rejected.

## What is measured

- `heuristic`: existing `chooseMasterCard` tactical tree with scoped
  `pickBestFromCandidates` adapter returning the first vetted card. This retains
  tactical logic and dynamic suit evaluation while disabling MC and DQN.
- `production`: existing `chooseMasterCard` including 100-world MC and enabled
  neural fallback. This isolates production **card selection**, not the whole
  server's timed interactions or live-learning updates.
- `neural`: persisted model directly chooses among engine-legal cards. This is
  an explicit ablation; it is not a claim about current live neural control.

The referee uses actual engine setup, toss, shuffle/cut, heuristic bidding,
reveal actions and authoritative `playCard`/scoring. It terminates a **single
hand/game** at GAME_RESOLVED or MATCH_OVER, not a multi-hand match to KHOTI.
Setup policy is identical regardless of candidate. Reveal requests are automatic
whenever permitted, pending caller reveals and pauses are resolved, and defenders
accept face-down challenges. All policies therefore share non-card decisions.
Bidding/reveal policy quality and server scheduling are outside this benchmark.

For each seed, reset the deterministic PRNG for engine setup and capture a SHA-256
fingerprint of initial private hands/trump, dealer and caller/mode context. Repeat
that setup with candidate on TEAM_1, then on TEAM_2 (same cards stay at the same
seats). Equal fingerprints are required; these are policy-team swaps, not two
independently shuffled games. Since initial hands and bidding are fixed, this
controls deal/seat advantage but does not measure candidate bidding strength.
Model deserialization occurs outside the per-game random stream. A separate
seeded play stream starts after setup; divergent policies may consume it
differently. Within each MC decision, candidate cards share worlds as in the
existing planner. There is no promise of common sampled worlds between policies
that reach different game states.

The PRNG is Mulberry32, seed is uint32, pairs use `(seed + pairIndex) >>> 0`.
Only synchronous CLI/test execution temporarily replaces `Math.random` and the
candidate adapter. Both restore in `finally`. Do not import these adapters into
a live server or run tournaments concurrently in one process. The test suite
checks same-seed action/outcome replay, adapter cleanup, identical paired deals
and symmetric baseline controls. Floating-point behavior is expected to be
stable on the same Node/runtime; latency is intentionally nondeterministic.

## JSON schema (version 1)

Top-level metadata: seed, pairs, candidate/baseline, Node version, model SHA-256.
`summary` includes completed/aborted games, wins for each policy assignment,
invalid moves, signed score total and decision latency per policy (count, mean,
p95, max in milliseconds). `results` retain each seed, assigned candidate team,
deal hash, winner, completion/error, completed tricks, score metric, trick
margin and each selected card/player/policy with latency.

There are not two conventional team scores in the engine: it tracks a signed
dealer score. `signedScoreAdjustment` is the authoritative hand adjustment,
negated when the candidate is the dealer's team, unchanged otherwise. Positive
means favorable to the candidate. It is computed from the scoring entry's dealer
team, not the possibly transferred current dealer. This is a candidate-relative
point differential per hand, not `dealerScore` after absolute-value transfer and
not a cumulative KHOTI match differential. `trickDifferential` is candidate tricks
minus baseline tricks and must not be used to infer the winner. Invalid moves
count selections outside legal cards and engine-rejected plays; other exceptions
are recorded separately as aborted-game errors.

Timing covers card selection, including tactical logic and MC or neural work,
not setup, networking, UI, reveal actions, or training. Forced single-card
choices are included. Cold code/JIT effects and machine load affect timing;
do not use these measurements as universal production latency guarantees.

No `LiveLearningEngine` hooks, training scripts or model saves run. A model hash
before/after each tournament detects accidental file changes. A focused neural
benchmark test also spies on `saveModel` and verifies its checksum. Read-only
model loading can initialize an in-memory random learner through imports, but
that learner does not train or persist.

## Committed baseline

Base engine/AI revision: `b07dea61c43edb4b5390566361f4bb405c6414c9`.
Run date: 31 October 2026; Node v24.19.0, locked dependencies. Model SHA-256:
`66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.
All runs use seeds 1–20, 20 pairs / 40 games against `heuristic`.

| Candidate | Wins–losses | Aborts / invalid moves | Signed point total | Mean / p95 / max selection ms |
| --- | --- | --- | --- | --- |
| production | 20–20 | 0 / 0 | +117 | 5.804 / 46.494 / 160.762 |
| neural (direct ablation) | 10–30 | 0 / 0 | -390 | .140 / .250 / 4.620 |

Full per-game/per-decision files:
[production](../benchmarks/ai-baseline-production.json) and
[neural](../benchmarks/ai-baseline-neural.json). The production run recorded 816
candidate decisions; neural recorded 888. Opposing heuristic means were .028 ms
and .034 ms respectively. The four-game default smoke also completed with no
invalid moves. A larger 1,000-pair tournament was not run.

These seeds are a small reproducible starting sample, not a statistically
established strength estimate, human percentile or proof of general improvement.
Paired games are correlated; do not treat 40 outcomes as 40 independent deals.
The same setup/bidding policy, existing hidden-information leak and limited
seed range constrain interpretation. The direct neural result does not measure
how often the model controls production: usually it does not. Use held-out seeds
and targeted rule scenarios before comparing model promotions. No algorithm was
modified to improve these figures.

## Validation and outstanding failures

Application TypeScript validation (`npx tsc --noEmit`) and the added benchmark
script check pass. The focused suites contain 13 ordinary passing tests and 12
explicit expected failures for the audit's unresolved defects. The original
109 tests remain separate from those expected failures.

Type-checking the old training scripts explicitly (they are excluded from the
repository tsconfig) exposes pre-existing errors: missing `Card` import,
nonexistent `dealerDistributeRemainingCards`, and a nonexistent public
`secretTrumpSuit` field. Reproduce without running or saving models:

```sh
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck scripts/train_ai.ts scripts/train_expert_imitation.ts
```

That command is expected to exit nonzero until a separate trainer correction.
Neither trainer was run. See [AI_AUDIT.md](AI_AUDIT.md) for the ranked findings and
remaining parity/gradient work.
