# Pre-merge AI refinement review

Base: `253525b80feb2b182ab479c9e2863145526e47ef` on the existing
`fix/ai-correctness-and-learning` branch. No replacement architecture, worker
threads, dependencies, trained-model writes or gameplay-rule changes.

## Search recovery

Every iteration commits a complete candidate score vector atomically. Every
candidate uses the same world. A partial vector never affects selection.

| Failure | Recovery | Rationale |
| --- | --- | --- |
| Sampling rejection | Keep earlier complete comparisons; retry within the attempt limit | Rejection is independent of candidate utility |
| Invalid world found by pre-validation | Reject for all candidates before scoring; keep earlier comparisons | No candidate-dependent censoring |
| Deadline during a later comparison | Discard the unfinished vector; stop and use the complete prefix | Every retained candidate has the same completed-world count |
| Engine transition failure | Stop and choose the legal heuristic fallback | Resampling a world because a particular move failed could bias evaluation; evaluator integrity is uncertain |
| Unexpected sampler/validator bug | Stop with a separately classified internal failure | An implementation fault is not an ordinary invalid random draw |

The fallback is also used if no comparison completed. Structured diagnostics
include category, reason, count, attempts, completed comparisons and whether
scores were used. Repeated reasons aggregate per decision. Counters distinguish
sampling failures, invalid worlds, transition failures, internal failures,
deadline stops, discarded partial vectors, recovered decisions and fallbacks.
`worlds` counts complete comparisons; diagnostics say when a fatal error prevents
using them. `recoveredDecisions` counts use after independent draw/world rejection;
normal deadline-prefix use is represented by `deadlineStops` and `scoresUsed`.

`SearchRecovery.test.ts` injects rejection, invalid-world, transition, internal
and deadline failures after three successful worlds. Huge partial scores cannot
contaminate the result. Additional assertions prove deadline checks happen
between engine transitions, terminal public history is serialized only once per
rollout, and unused toss initialization never consumes RNG during a rollout.

## Latency investigation and limits

Eight rooms, 24 synchronized waves, 700 ms cadence: 178 actual bot turns and
192 scheduled room jobs. The harness includes four-player state serialization
and real in-memory learning. Checkpoint/learner startup is measured separately.
Node v24.19.0. Results are in
[`ai-refinement-results.json`](../benchmarks/ai-refinement-results.json).

| Measurement | Original direct timers | Optimized direct timers | Optimized room queue |
| --- | ---: | ---: | ---: |
| Mean bot-turn computation ms | 6.335 | 3.066 | 3.245 |
| p95 computation ms | 29.315 | 16.955 | 19.287 |
| Maximum computation ms | 39.287 | 28.807 | 28.830 |
| Maximum event-loop delay ms | 228.196 | 135.922 | 35.553 |

The prior 250+ ms decisions came from fixed-world offline benchmarks with no
wall-clock cutoff. The live timer experiment exposed a separate burst problem:
several due callbacks could block the event loop in one batch despite much
shorter individual calls.

Rollouts now read scalar turn/reveal state, use the same authoritative permission
helper as private observations, serialize full public history only at termination,
and skip toss shuffling that cannot influence trick play. Deadline checks occur
inside transitions and between candidate calls. Computation remains bounded by
world attempts, the 52-card matching graph and 160 rollout transitions.

A deduplicated room queue executes one room turn per timer task, yielding between
rooms. Deferred jobs recheck phase, actor, game, trick and card count before
acting. No worker threads were necessary for this measured load. Queue wait is
separate from computation: mean 22.340 ms, p95 78.031 ms, maximum 117.821 ms in the
queued run. This is an explicit throughput/responsiveness tradeoff.

**The 25 ms budget is cooperative, not a hard real-time limit.** A synchronous
engine operation, GC, learning batch or OS scheduling delay cannot be preempted.
The observed 28.8 ms maximum and 35.6 ms event-loop maximum are samples, not upper
bounds. Load above eight rooms and production-specific latency targets need
further measurement. Historical zero-cutoff tournament timings must not be
presented as live-budget guarantees.

Reproduce the current direct/queued comparison (use new output filenames):

```sh
npm run benchmark:latency -- --scheduler direct --rooms 8 --rounds 24 --cadence-ms 700 --output /tmp/direct.json
npm run benchmark:latency -- --scheduler queued --rooms 8 --rounds 24 --cadence-ms 700 --output /tmp/queued.json
```

The baseline record was captured before modifications. The final harness can
also run its direct mode against the base implementation when copied there:
queue implementation loading is conditional on `--scheduler queued`. It requires
no browser, external service or microphone. Timing varies with host/JIT/GC load;
the restored session retains the original raw measurement files under `/tmp`.

## Hidden-information adversarial audit

Concealed identities are checked across current, previous and completed tricks,
side-panel cards, last-winning-card metadata, revealed hands and status producers.
The serializer uses explicit card/play/trick/player/scorecard DTO fields, so
unknown private debug properties are not accidentally spread into payloads.
A concealed winning-card reference cannot escape through `lastTrickWinningCard`
or its winner status message. Revealed-hand echoes of concealed cards fail closed.

Adversarial tests swap concealed identities and require equal unauthorized
payloads, including injected secondary aliases and private debug metadata. They
verify correct disclosure after an explicit reveal. Independently public toss
history is preserved even if an old toss card shares a concealed deal card's ID:
conditionally deleting that old public value would itself leak information.
This noninterference check is stronger than searching payload text for card IDs.

Player-specific permissions are preserved: the caller keeps their locked trump
and remembered plays; the caller's team can peek at a challenge; defenders retain
permitted partner inspection. Spectators receive none of these private views.
Nested scorecard records no longer expose mutable authoritative references.

## Voice isolation

Both voice event handlers resolve room and sender at event time from the server's
socket-to-player mapping and its reverse mapping. Client player, socket and room
IDs do not determine identity or routing. Recipients are only sockets registered
in that current room. Audio excludes its sender; mute feedback includes it.
Spectators, disconnected sockets and stale/inconsistent mappings cannot transmit.
Existing spectator reception within their registered room is unchanged.

Unit tests cover forged IDs, room switching and rejected stale mappings. A real
four-client Socket.IO regression runs on an ephemeral loopback port and uses
ordered delivery barriers to prove packets cannot leak to the other room. This
needs ordinary loopback listening permission when run inside a restrictive
execution sandbox; no network/security settings were changed.

## Final validation and targeted games

Passed after execution-service reconnection:

- `npx tsc --noEmit`
- `npm run typecheck:ai` (includes trainers and benchmark scripts)
- `npm test`: **178 ordinary passing tests, 21 files**, no skips/expected failures
- `npm run build`: passes with the existing nonfatal large-chunk warning

One prior fixed-iteration invariant test assumed all three worlds would finish
under the live cutoff. It now explicitly uses `timeMs: Infinity`, retaining all
its comparison-count/mutation assertions. Deadline behavior has separate
clock-controlled regressions; no failing assertion was removed or weakened.

Fifty paired deals per comparison, seeds 1–50, 16 corrected worlds and 100 legacy
worlds, no time cutoff:

| Candidate vs baseline | Wins–losses | Signed points | Paired 95% win-rate interval |
| --- | --- | ---: | --- |
| corrected-search vs heuristic | 49–51 | +78 | 43–55% |
| corrected-search vs legacy | 49–51 | -39 | 43–55% |

All 200 hands completed with zero invalid moves, aborts, sampled/world validation
failures, transition failures or search fallbacks. Corrected selection latency
mean/p95/max was 2.465/16.188/49.967 ms against heuristics, and
2.067/13.085/58.585 ms against legacy. These are **offline** fixed-world timings.
The unused toss RNG removal changes the finite sampling stream, not the initial
setup/deal distribution. Do not pool these games with older-version results or
claim greater playing strength from the optimization.

Canonical checksum before/after completed runs and after final validation:
`66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

Recommendation: merge after review of the privacy/voice and recovery changes;
retain soft-deadline monitoring and evaluate higher room loads against the actual
production SLA. No hard latency guarantee, stronger-AI claim, model promotion or
automatic merge is implied.
