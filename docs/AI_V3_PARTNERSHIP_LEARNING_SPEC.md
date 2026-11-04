# Bund Rung AI V3: Expert Partnership Intelligence

Status: implementation contract, experimental only. Base: feature/ai-v2-ismcts. Do not merge or change corrected-search production default without independent review.

## Goal
Learn expert partnership signals, card counting, control of lead, hidden-trump management, and post-reveal consecutive-trick planning without hardcoded signal-to-action rules. Preserve authoritative engine, privacy boundaries, and V2. Learn from expert demonstrations, then evaluate self-play. Do not claim model intelligence without held-out evidence.

## Expert hypotheses (probabilistic, not guaranteed)
1. If opponents called rung, our team tries to force reveal by returning a partner's likely short suit, sometimes on repeated opportunities. A low suit lead immediately after partner wins suggests shortage and a request to return that suit.
2. A high suit lead may mean partner intends to win and lead the same suit again; wait for subsequent evidence.
3. A high-card win followed by a different low suit can be ambiguous: partner may actually be void in the suit of the previous high card. Use remaining suit counts, prior plays, opponent behaviour and context to distinguish.
4. A partner may avoid winning until able to communicate a useful shortage. This is only a latent hypothesis, never a known fact from public history.
5. If our team called rung, prioritize control to prevent opponents coordinating a reveal. When partner leads a weak suit, strong own cards can take control and switch to a personally weak suit; if also weak, return partner's suit when counts and risk support it. Returning weak suits can exhaust cards and prepare future trump use while preserving concealment.
6. After reveal, identify actual highest outstanding cards using observable facts and uncertainty, plan for same individual player's consecutive trick wins, prefer suits with fewer played cards when strategically justified, and conserve or expend trump according to caller strength. Caller playing trump before reveal is evidence of potential weakness, not certainty.
7. All heuristics can conflict; ultimate objective is official game outcome, not maximizing signals or reveals.

## Stage 1: Expert data schema and annotation
Implement versioned observation-only feature extraction, legal action masks, chronological public play history, suit counts, per-seat public void evidence, partner's preceding trick win/lead strength, caller/team/trump status, personal high-card estimates, current trick and score context. Exclude hidden opponents' hands and undisclosed trump. Define separate latent labels for partner suit shortage, intended return suit, desired lead-control and strategy phase. Training-only labels may use complete simulated hands, but model inputs and inference must not. Expert intent labels require expert annotations or validated teacher behaviour; do not infer intent as ground truth solely from hidden-card counts. Provide an annotation format that records ranked alternative legal actions, reasoning, confidence and uncertain labels. Include examples from the conversation as hypothetical scenarios, not assumed legal game states.

## Stage 2: Data and expert teaching workflow
Build a reproducible CLI to generate reachable seeded positions using official engine, export anonymized observable decision packets, import and validate expert ranked decisions and explanations, and check legality and consistency. Support multiple annotators and disagreement. Separate training, validation and frozen holdout by complete initial deal and opponent policy; avoid leakage from near-duplicate trajectories. Preserve deterministic dataset manifest, hashes, version, provenance and label quality.

## Stage 3: Train interpretable baseline and compact sequence model
Start with supervised baselines (e.g. regularized logistic/MLP) for suit shortage and return-suit intent, plus legal-masked card preferences. Then implement a compact chronological sequence encoder only if baseline fails on prespecified tests. Use probabilities with calibration, class imbalance handling, proper scoring metrics (Brier, log loss, ECE) and abstention for weak evidence. No fixed if/else mapping from signal to move. Legal forced actions and game rules remain deterministic. Keep training offline and checkpoint versioned, hashed, atomic, separate from canonical neural weights.

## Stage 4: Integration with search
Experimental opt-in policy `ai-v3-partnership`. Feed calibrated partner intent, card-strength and lead-control predictions into V2 as soft priors or observation-only rollout guidance, not absolute decisions. Keep neural evaluation from seeing sampled hidden opponents' cards beyond legal actor observations. Ablate each learned component; compare identical search work and matched actual CPU. Fail safely to V2/corrected-search if checkpoint missing, invalid, slow or uncertain. Do not use learned model to override forced rules.

## Stage 5: Self-play (only after supervised validity)
Use paired cooperating agents and diverse opponents. Train for official team outcome, not shaped reward for reveal or suit returns. Auxiliary supervised labels may teach hidden suit shortage during training but not inference. Prevent collusion via hidden information, exploit of weak opponent policy, overfitting to fixed partners and evaluation against the same self-play population. Include expert-play baselines and multiple opponent styles.

## Mandatory evaluation gates
- Public-information noninterference: swapping unseen opponent hands without changing observations must not alter model features/predictions; concealed cards, hidden trump and metadata must not leak.
- Rule parity remains intact; no game-engine changes unless separately reviewed.
- Expert-signal scenario suite: low vs high lead, repeated return, misleading high-Ace-to-low-suit sequence, our caller with strong vs weak supporting suit, opponent caller, deliberate non-win uncertainty, post-reveal consecutive wins, caller trump weakness uncertainty. Include counterexamples and varied seeded deals. Score ranking and probabilistic calibration, not just memorized choices.
- Show baseline comparisons, ablations, >=1000 fresh held-out paired deals vs corrected-search and V2, 95% paired CI, signed official score, 8/16/32-room load, p50/p95/max decision and queue wait, deadline stops, invalid moves, fallbacks. Include equal-work and matched-time comparisons separately.
- Preserve corrected-search production default, all existing policies, canonical checkpoint SHA256 66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3, no client-controlled policy selection.
- Do not promote unless meaningful win improvement survives fresh heldout tests and responsiveness is acceptable. Document negative results honestly.

## Delivery order
A. Data specification, expert annotation CLI, reproducible fixtures and privacy tests.
B. Trained baseline, validation and calibration report.
C. Sequence model if justified.
D. V2 integration and self-play.
E. Held-out tournaments and latency tests.
Work in reviewable commits, maintain documentation and an experimental draft PR. Never merge automatically. If expert labels are unavailable, complete A and implement training scaffolding, then explicitly request human labels instead of fabricating them.
