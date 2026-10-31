# Bund Rung AI: corrected foundation

Base: `audit/ai-foundation-and-benchmarks` at `10075a49ebfc65806a58c66f1644ff338b73db7d`.
The original audit remains in that branch's history. This branch repairs its
correctness findings without changing game win/scoring rules or the trained JSON.

## Information boundary

`BundRungEngine` retains authoritative `PlayedCard`/`Trick` records with real
cards. `getPublicState()` creates `VisiblePlayedCard`/`VisibleTrick` observations:
concealed `card` is **null**, not a fabricated card or encoded card ID.
Face-down side-panel identifiers are opaque turn/player slots. History remains
concealed until reveal; challenge surrender does not disclose an unaccepted lead.
Known false Ace-downgrade flags are retained; concealed rank-bearing flags are
redacted. Observations clone card objects, so consumers cannot mutate live cards.

`getClientGameState(viewer)` combines that same public view with the viewer's
private state. Spectators use an empty viewer ID. The caller retains their locked
trump/suit and remembered own concealed plays. Existing rules permit a caller's
team to peek at a challenge card and defenders to inspect their partner's hand
while responding: these remain private, permitted information. All
`gameStateUpdated` emissions use `transport/GameState.sendGameState`, including
initial, player and spectator updates. No Socket.IO event names change.

Shared types intentionally change public played cards to nullable cards. The
existing UI renders null as a card back; only null guards/keys/helper signatures
changed. Trackers and neural features skip concealed identities while retaining
public card counts and player positions. `trumpWasRevealed` records the public
reveal state at the time of a play: later card flips cannot turn a caller's
pre-reveal discard into false proof that their locked trump suit is absent.

Card selection receives public/private observations and a player-list facade;
it does not receive the live engine's hidden-hand storage. The turn handler uses
the engine only to read its own observation and execute authoritative actions.

## Explicit decision policies

`DecisionPolicy` selects policies through arguments, without replacing static
methods or global candidate-selection functions:

| Name | Card controller | Intended use |
| --- | --- | --- |
| `heuristic` | Existing tactical tree; first vetted candidate | Safe deterministic baseline/fallback |
| `production-legacy` | Preserved original approximate MC, normally 100 worlds | Evaluation of the old algorithm only; known rule defects retained |
| `corrected-search` | Existing tactical tree; constrained worlds and engine rollouts | Live default |
| `neural-direct` | Validated network, masked to all legal cards | Evaluation/training only; not enabled in production |

`chooseMasterCard` still supplies the existing tactical candidate pruning. Direct
returns and one-candidate choices bypass search. Bidding remains
`DynamicSuitEvaluator`; toss/cut/shuffle remain the existing setup controls.
Reveal obligations and challenge votes are explicit engine actions. The obsolete
`useNeuralPolicy` flag is retained only for source compatibility and no longer
selects a controller. Learning uses an explicit internal room context.

Corrected search never silently routes a search failure to the weaker neural
controller. It logs a structured reason and returns the first legal tactical
candidate. Neural inference/fallback/world counters are available to benchmarks.

## Constraint-preserving worlds and authoritative rollouts

`WorldSampler.sampleWorld` reserves own cards, own locked trump, visible played
cards, revealed owner cards, legitimate partner inspections and remembered own
plays. It allocates unknown cards to public hand capacities and concealed played
slots. A randomized augmenting-path bipartite matching respects all forbidden
suits without relaxation. Infeasible counts, duplicated/conflicting ownership,
invalid cards and impossible voids produce explicit `SamplingError` reasons.
The actor's full held-card count must be accounted for; omitting a known locked
trump is an error rather than an opportunity to assign it elsewhere.

A sampled caller locked card is reserved separately from playable hand cards.
Unknown lock identity/suit is sampled from compatible held cards; this is a
plausibility distribution, not knowledge of the actual opponent hand. Hidden
lead slots respect their publicly known lead suit; hidden off-suit caller plays
exclude the lead suit. Matching is bounded by the 52-card/slot graph. Its
randomized distribution is not claimed uniform or a calibrated bidding posterior.

`BundRungEngine.fromObservation` constructs an independent engine using **only**
the sanitized observation and sampled world. It restores the current/history
cards, individual eligible streak, previous winning card, locked card, reveal
requester/obligations, challenge votes, scorecard and dealer state. Every action,
future Ace downgrade, follow-suit restriction, reveal, early/final win, scoring
modifier, transfer and KHOTI outcome then runs through the same engine methods
used by live play. `ScoringEngine` accepts a cloned initial scorecard. There is
no second corrected implementation of trick resolution.

Rollout continuation is deterministic lowest-legal-card play, with compulsory
reveals, caller show, resume and challenge acceptance. It ends at the actual
hand boundary or throws an explicit error; no dummy cards or inferred majority
winner are used. One sampled world is used for every candidate in an iteration;
partial comparisons are discarded. Independent invalid worlds preserve earlier complete comparisons; transition/internal faults fail closed. Inputs and live state are not
mutated.

Utility is the actual dealer-relative hand adjustment, plus +/-1000 for an
actual terminal match win/loss. The bonus deliberately prioritizes KHOTI over
any single-hand adjustment (maximum magnitude 208); it is an evaluation utility,
not a scoring-rule change. Future hands after dealer transfer are not searched.

Default search budgets: 16 worlds, 25 ms **soft** cooperative deadline, checked
inside rollout transitions and between candidate evaluations. Iterations are capped at 1,000 and
rollouts at 160 transitions. A single comparison/GC pause can exceed the time
budget: this is not hard preemption or a worker-thread implementation. Offline
benchmarks use fixed world counts with `timeMs: Infinity` for reproducibility.

## Learning and network

`TurnLearning` owns one room's pending actions and identifies each hand by engine
identity, game index and generation. Successful plays end at that actor's next
**legal** decision, or a true GAME_RESOLVED/MATCH_OVER terminal observation.
Between-turn empty masks do not close transitions. Rejected plays are validated
before history changes. Departure, new match or engine replacement discards
incomplete pending actions. New game indices cannot carry history forward.

Rewards default to authoritative terminal hand win/loss (+1/-1). Configurable
`RewardConfig` separates optional trick shaping and signed score shaping; both
are zero by default. Humans receive no expert/winner bonus. Each room has its own
learner and replay. Live minibatches of four run through `setImmediate`, only
when new experiences exist, and update memory only. They never save or promote
a production checkpoint. Closing/deleting a room cancels its queued learning.

The network remains the dueling, layer-normalized MLP. Correct derivatives cover
all advantage outputs through the mean term and both normalization layers.
`trainStep` reports the actual sum of masked Huber losses (delta 1), whose clipped
derivatives it applies. Fixed small-network tests check representative parameters
in every tensor against finite differences, not merely decreasing loss.

`FeatureSchema` defines all feature groups and the shared 245-input size. New
checkpoints include format, architecture and feature-schema versions. Loading
validates every dimension, tensor length and finite Float32 value. Production
policy loaders require 245 inputs/52 outputs. The preserved baseline alone has a
hash-pinned legacy metadata exception; malformed legacy files do not get it.
Experimental writes require an explicit new path, use fsynced temporary files and
atomic exclusive hard links, reject existing paths/aliases, and cannot target the
canonical model. There is no automatic promotion path.

Self-play exploits the learner's current online network with epsilon exploration;
imitation separately labels legal heuristic-teacher actions. Both share current
engine setup/forced-action lifecycle, reject incomplete episodes, use actual
terminal winners, compile under `tsconfig.ai.json`, and save only an explicitly
named experimental checkpoint after successful completion. Neither training
progress nor repaired mathematics is evidence of stronger play.

## Pre-merge refinement

See [AI_REFINEMENT_REVIEW.md](AI_REFINEMENT_REVIEW.md) for stage-classified search
recovery, atomic comparison retention, scalar rollout status access, room-turn
scheduling, all-field adversarial serialization tests and socket-derived voice
room isolation. The canonical model and authoritative gameplay rules remain
unchanged. The 25 ms deadline is cooperative, not hard preemption.
