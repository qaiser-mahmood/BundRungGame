# Advanced strategic AI experiment

`advanced-search` is opt-in. `corrected-search` remains the default. The verified base is `0feadd15502f55e6e7c0337ae617aebbb3a22e1d`. No engine rules, Socket.IO contracts or neural weights change.

## Rules and baseline

`handleBotTurn` handles bidding, challenge acceptance and mandatory reveal before card selection. Corrected-search retains its ordered tactical candidate filters and lowest-legal-card continuations. Those continuations conserve cards without considering who must win, partner safety, or an eligible individual streak. They are cheap but can model implausible future play.

Bund Rung is not a majority-of-tricks game. The authoritative engine resolves the final (13th) trick, or eligible consecutive wins by the **same opponent of the caller** after reveal (first trick excluded). Trump has no superiority until revealed. The caller's locked card is separate; opponent void/reveal rights and post-reveal compulsory trump are engine rules. Leading an Ace after winning the preceding trick with an Ace downgrades that lead to 2. Concealed caller discards and accumulated history remain concealed until legitimately revealed. Terminal evaluation uses the existing official score adjustment and match outcome, including modifiers, dealer transfer and KHOTI, rather than awarding arbitrary points per trick.

## Beliefs and information boundaries

`OpponentBeliefs` is created per observation, so games, observers and rooms share no belief cache. A new observation replaces the previous estimate after plays, reveals or inspections; there is no persistent cross-hand behavioural profile. The existing constraint sampler enforces ownership, exact remaining counts, public voids and concealed slots. Up to 64 decision-local sampled worlds provide empirical ownership, suit-count, higher-card, void and hidden-trump estimates. Matching samples are **not uniform or calibrated Bayesian posteriors**.

Before particles exist, suit/higher-card probabilities use a hypergeometric marginal approximation over eligible unseen cards. These soft estimates ignore some joint constraints and correlations. Known hands use actual legitimate public disclosures or the observer's private inspection. Losing does not prove the absence of a higher card. Guesses never become sampling constraints. Missing suit-count estimates return NaN rather than a false zero.

Root particles are used as search worlds. Continuations build independent beliefs from the simulated acting player's public state and own private state. They cannot inspect the root particle's other hands. This prevents a direct determinization oracle; it does not eliminate every source of strategy fusion or sampling bias in open-loop Monte Carlo evaluation.

## Partnership preferences

`rankPartnershipActions` ranks only engine-provided legal cards. It estimates team hold probability from visible winners, remaining seats, higher-card probabilities, ruff probabilities and legitimate partner disclosures. It conserves non-trumps and then lower ranks within a configurable safety band; unsafe actions are ordered by estimated hold probability. Eligible personal streak completion takes precedence when sufficiently safe. Downgraded Aces are evaluated at 2. Hidden trump is conserved when otherwise comparable, but cannot win as trump before reveal.

The estimates are conditional preferences, not reward bonuses. Actual game outcome from authoritative rollouts selects the root action. Opponent voids create reveal pressure through the unchanged forced-reveal simulation. No separate learned bidding or voluntary reveal policy is introduced. `benchmark:tactics` exercises preferences and counterexamples; it is not evidence of match strength. Its synthetic observations isolate particular tactics, rather than claiming to represent complete 52-card deals.

## Search and exact endgames

Advanced-search bypasses the old tactical filter, ranks all legal actions and evaluates a shortlist of at most four. The default attempts two common worlds in ordinary positions, up to four in trick 11+ or streak positions. Every root candidate uses the same world; only complete comparison vectors are committed. Existing independent-sampling recovery, fatal transition-error handling, diagnostic counters and atomic deadline recovery remain shared with corrected-search. Shortlisting can omit the strongest action.

The continuation hook receives `(publicState, actorPrivateState, legalCards)`, never an engine or the complete sampled world. Simulation still uses `BundRungEngine.fromObservation` and authoritative transitions. Corrected-search's original fast continuation is unchanged when the hook is absent.

`ExactEndgame` runs team minimax only with at most eight remaining held cards, all remaining ownership publicly disclosed, no concealed history, and public locked-trump identity if present. Private inspection, root-only knowledge or a sampled world is insufficient. Ambiguous endgames abstain. The solver uses full observation-and-hand local cache keys, 1,000 nodes and at most min(5 ms, one quarter of live budget). Incomplete root comparisons are discarded. Public-hand eligibility is intentionally stricter than inferring unique ownership: solver usage may be zero in ordinary games.

## Budgets and configuration

The live decision has a 25 ms **soft** budget including ordering and solver time. Search checks between sampler calls, candidate rollouts and each authoritative transition. Sampling, serialization, one continuation evaluation, garbage collection and OS scheduling are indivisible; no synchronous JavaScript implementation promises a hard wall-clock bound. Node/world/candidate limits bound work independently. The existing room queue yields between room jobs. No worker threads are introduced.

Opt in on a test server using `BOT_DECISION_POLICY=advanced-search`; absent configuration remains corrected-search. Invalid policy names fail startup. Existing other policy names remain available. In-process callers can pass `DecisionPolicy.strategy` (`safePartnerProbability`, `worlds`, `candidateLimit`) and normal search budgets. Budget exhaustion retains a complete comparison prefix or returns the first ranked legal candidate. Canonical training and persistence are untouched.

## Frozen evaluation protocol

Default strategy: safety probability 0.75, four maximum worlds (two ordinary), four maximum candidates; corrected baseline: 16 iterations. Strength tournaments use infinite time with bounded fixed work for reproducibility. Live latency uses the 25 ms budget separately. Development smoke seeds 1–50 and initial seeds 201–400 are disjoint from final seeds 100000–100999. Safety sensitivity uses 0.6 and 0.9 on development seeds 201–250. No reward weights are added. Retain 0.75 unless development evidence is compelling; final held-out results must never be used to tune it.

Promotion requires preferably >=55% held-out wins, paired 95% interval excluding 50%, and no material score, reliability or latency deterioration. Results and limitations are recorded in the accompanying Phase 2 report. No automatic promotion or merge occurs.
