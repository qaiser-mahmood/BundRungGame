# Codex Task: Capture Expert Bund Rung Strategy Knowledge from Our Discussions

## Project

Repository: `qaiser-mahmood/BundRungGame`

Existing work:
- AI V2: `feature/ai-v2-ismcts`, PR #3
- AI V3: `feature/ai-v3-partnership-learning`, PR #4

**Objective:** Create a structured, versioned expert knowledge base containing the Bund Rung strategies, reasoning, signals, exceptions and corrections supplied by the human expert during our scenario discussions.

This task is about capturing knowledge accurately, not implementing a new gameplay policy.

## 1. Non-negotiable requirements

1. Work on a separate branch based on the current AI V3 branch.
2. Do not modify the production/default AI policy.
3. Do not modify the canonical neural model checkpoint.
4. Do not alter official game rules, scoring, trump mechanics or legal-move validation.
5. Do not manufacture expert demonstrations or training labels.
6. Do not treat strategic preferences as guaranteed rules.
7. Preserve uncertainty, exceptions and context.
8. Do not run expensive self-play, model training or full integration suites for this documentation-focused task.
9. Verify actual game mechanics against the official engine before describing them as facts.
10. Do not silently reinterpret the expert's statements.

## 2. Create an expert strategy knowledge base

Suggested location:

`docs/ai-v3/expert-knowledge/`

Create:

- `README.md`: Purpose, limitations and how to use the knowledge.
- `expert-principles.json`: Machine-readable strategic principles.
- `scenario-examples.json`: Expert decisions and reasoning from the discussions.
- `corrections-and-ambiguities.md`: Corrections, uncertainty and unresolved questions.
- `knowledge-schema.json`: Validation schema.
- `AI_V3_EXPERT_KNOWLEDGE.md`: Human-readable consolidated strategy guide.

Use existing V3 conventions where practical, but do not force these principles into the existing expert-annotation format if required observation snapshots are unavailable.

Each principle should include:

- Unique stable ID
- Strategic category
- Game phase
- Preconditions
- Expert's preferred action
- Reasoning
- Expected strategic benefit
- Exceptions
- Confidence or certainty classification
- Whether it is an official rule, expert preference, inference or hypothesis
- Evidence from the expert discussion
- Related principles
- Open questions

Each scenario should identify the relevant cards, trick position, rung caller, rung visibility, known public history and the expert's response.

Do not invent missing hand information or public history.

## 3. Expert knowledge to capture

### A. Rung caller strength and responsibility

**A1. Forced versus voluntary rung calls**

If the rung caller is also the dealer and must call, their hand may be weak.

If the player voluntarily chooses the rung, the expert considers them more likely to be strong in their selected trump suit.

This is probabilistic evidence, not certainty.

**A2. Supporting the rung caller**

When the partner called the rung, generally prefer allowing them to maintain control when they are already winning.

Do not unnecessarily overtake a winning partner.

This preference is especially important when the partner is building consecutive winning tricks.

However, partner control is not an absolute requirement. Exceptional circumstances may justify taking control.

### B. Third versus fourth position

**B1. Remaining-player risk**

If playing third and an opponent remains to act, a card that currently wins may still be overtaken.

Example:

Partner: 4♦  
Opponent: 8♦  
Expert holds: A♦, K♦, 10♦, 6♦

Expert prefers A♦ because 10♦ could be beaten by the remaining opponent.

**B2. Last-player efficiency**

If playing fourth, and 10♦ is sufficient to beat the other cards, the expert may play 10♦ and preserve stronger cards.

This is context-sensitive.

### C. Ace management and double-Ace rule

The expert reports a game mechanic in which consecutive Ace plays can cause the second Ace to lose seniority and become equivalent to a 2.

**Important:** Verify the exact conditions and implementation in the official engine. Do not invent or change the rule.

The expert treats avoiding a double-Ace disadvantage as a preventive consideration, not the overriding objective.

Examples:

- Holding A♦, K♦, 3♦ and A♠, the expert prefers A♦ over K♦ when both win, retaining K♦ as a strong diamond.
- Holding A♦, J♦, 3♦ and A♠, the expert prefers J♦ when J♦ is sufficient to win, retaining A♦ because J♦ does not provide comparable future control.
- Holding A♦, Q♦, 3♦, with K♦ already played, the expert considers A♦ and Q♦ strategically interchangeable in the discussed situation.

Do not derive a universal rule that Aces must always be played before Kings, or that the lowest winning card is always optimal.

### D. Preserve strong suits

The expert frequently preserves suits in which they have high-card strength.

Examples:

- Holding A♠, 9♠, 3♠, prefer exploring a different suit rather than unnecessarily leading spades.
- After winning with A♠, switch suits and retain K♠ for later defensive control.
- Avoid spending strong cards merely to demonstrate strength.

A strong suit can become particularly valuable after rung reveal, when opponents attempt consecutive wins.

### E. Team strength is not individual strength

An important expert principle:

**A suit that is weak for one partner may still be strong for the team if the other partner can cover it.**

Evaluate partnership coverage, not just each player's individual weakness.

A partner's low-card lead or return may communicate shortage or weakness.

Do not automatically return the signalled suit if doing so sacrifices the team's control or exposes the rung.

### F. Interpreting partner signals

Signals are inferred from sequences of plays, not individual cards in isolation.

Examples:

- Partner wins with A♥ and then leads 2♣: expert interprets this as a possible indication that partner is now void in clubs, not hearts.
- Partner wins and returns a low spade: expert interprets this as evidence of spade weakness and, when partner called the hidden rung, evidence that spades may not be trump.
- Winning a trick with a strong card may have been forced or natural, rather than an intentional signal.

Signals must be probabilistic and context-dependent.

Record what is known, what is inferred, and what is speculative.

### G. Protect hidden rung when our team called it

When our team called the rung and it remains hidden:

- Avoid voluntarily leading a suit in which an opponent is confirmed void if that creates an opportunity to force reveal.
- A suspected shortage is less decisive than a confirmed void.
- Prefer exploring an untouched suit where appropriate.
- Count outstanding cards and estimate who may hold them.
- Preserve strong cards that can later stop an opponent's winning streak.

Example:

Holding singleton 7♦, if an opponent is confirmed void in diamonds, expert strongly avoids leading 7♦.

If an opponent is only suspected to be short, the expert may consider diamonds after assessing safer alternatives.

### H. Exploring untouched suits

The expert often prefers a suit not previously played, especially when many cards of that suit are likely distributed among the other players.

Example:

Holding A♠, 9♠, 3♠, when spades have not been played and several spades remain in other hands, expert prefers leading 3♠.

This preserves A♠ while testing the suit.

The expert then observes how the partner and opponents respond.

This is a strategic preference, not a guarantee that an untouched suit is safe.

### I. Avoid supporting opponent signals

If an opponent has indicated a shortage or desire for a suit to be returned, avoid voluntarily helping them exploit it when our team is protecting hidden rung.

A partner's signal is relevant but does not automatically override this danger.

### J. Opponent winning versus partner winning

**J1. Partner already winning**

Example:

Partner Q♠ beats opponent 9♠.

Expert holds K♠ and 3♠.

Expert plays 3♠, allowing partner to win and preserving K♠.

**J2. Opponent winning**

Example:

Opponent Q♠ is winning.

Expert holds K♠ and 3♠.

Expert plays K♠ to take control.

**J3. Protecting team control**

Example:

Partner Q♣ is losing to opponent K♣.

Expert holds A♣, 8♣, 3♣.

Expert plays A♣.

**J4. Stop opponent's consecutive wins**

If an opponent is about to win another consecutive trick, the expert strongly prefers stopping them when a winning card is available.

Record the actual scoring consequences using the official scoring engine, not assumptions.

### K. Do not unnecessarily overtake a winning partner

Example:

Partner Q♥ is winning.

Expert holds A♥ and 3♥.

Expert plays 3♥.

Even if an opponent is confirmed void in hearts, the expert still prefers 3♥ in the discussed scenario.

Reasoning:

- The partner is already winning.
- Spending A♥ may be unnecessary.
- The partner may continue controlling the game.
- A future risk of rung reveal alone does not justify overtaking.

A previously discussed possible exception involved taking control to prevent a dangerous next lead, but the expert subsequently clarified a strong preference for leaving control with the partner.

Preserve this distinction rather than representing the exception as equally preferred.

### L. When the opponents called the rung

The objective may shift toward creating opportunities for our team to force the rung reveal.

Example:

Partner wins with A♥ and then leads 2♣.

Expert interprets the club lead as possible evidence of club shortage.

When later controlling the lead, the expert may return 4♣ to exploit that shortage.

However, the expert also considers whether an opponent is void in clubs and whether returning clubs is safe.

### M. Outstanding card counts and repeated leads

**This principle was explicitly corrected by the expert and must be represented accurately.**

A large number of outstanding cards in other players' hands generally makes repeatedly leading that suit less attractive, unless the expert holds sufficient high-card strength to control the suit over multiple leads.

Example:

If five or more clubs remain in other hands, repeatedly leading clubs may be reasonable with several commanding high clubs, but generally not with only Q♣ and 4♣.

The expert evaluates:

- Number of cards remaining
- Likely distribution among players
- Own high-card strength
- Ability to retain lead
- Risk of opponents winning or forcing reveal
- Whether two or three consecutive leads are realistically possible

**Do not encode "five outstanding cards" as a universal threshold.**

### N. Multi-trick planning

The expert regularly plans more than one trick ahead.

Examples:

- Win with A♦ while retaining K♦.
- Lead Q♥ or J♣ to explore weaker suits.
- Preserve A♠ for future control.
- Consider whether leading a suit allows an opponent to become void.
- Consider whether the same player can continue winning.
- Switch suits to preserve high cards and avoid exposing hidden rung.

The model should evaluate action sequences and likely responses rather than only immediate trick-winning probability.

## 4. Preserve corrections explicitly

The following interpretations were corrected during the discussion:

1. **Incorrect:** Always return the suit your partner signalled.  
   **Correct:** Consider partner signals, but preserve own strength and avoid helping opponents or exposing rung.

2. **Incorrect:** Partner winning A♥ and switching to clubs indicates heart shortage.  
   **Correct:** The subsequent low-club lead may indicate club shortage. The Ace win alone may be natural or forced.

3. **Incorrect:** Many outstanding clubs automatically make clubs attractive to lead repeatedly.  
   **Correct:** Many outstanding clubs can make repeated club leads risky unless sufficient high-card control exists.

4. **Incorrect:** Always use the lowest card that wins.  
   **Correct:** Evaluate the remaining strength in the suit and the double-Ace interaction.

5. **Incorrect:** Confirmed opponent void always justifies overtaking a winning partner.  
   **Correct:** Expert still prefers preserving the Ace and letting the partner win in the discussed situation.

6. **Incorrect:** A partner's low-card signal establishes a certain fact.  
   **Correct:** Treat inferred signals as uncertain unless supported by directly observable game facts.

Do not leave these incorrect interpretations as active strategy principles.

## 5. Separate rules, preferences and hypotheses

Classify every knowledge entry into one of:

- `verified_game_mechanic`
- `expert_strategic_preference`
- `probabilistic_inference`
- `conditional_exception`
- `unverified_hypothesis`

A mechanic must be checked against the official engine before receiving verified status.

Examples of facts versus inferences:

- An opponent failing to follow suit may establish a confirmed void, subject to official rules.
- A low-card lead suggesting a shortage is an inference.
- A voluntary rung caller being strong in trump is a prior belief.
- Playing low when partner is winning is an expert preference.

## 6. Future AI training integration

Design the knowledge base so it can later support:

1. Human-readable strategic guidance.
2. Expert scenario annotation.
3. Supervised learning examples, once genuine observable game states and legal actions are available.
4. Probabilistic partner-intent inference.
5. Strategic feature engineering.
6. Evaluation of learned policies against expert preferences.
7. Self-play hypotheses that can be tested using official outcomes.

Do not convert the entire knowledge base into a deterministic decision tree.

Do not assign fake action probabilities or numerical confidence scores.

Do not train a model using these narrative examples as if they were complete game-state demonstrations.

Where a scenario lacks a complete observable state, mark it `narrative_only` and identify the missing information.

## 7. Knowledge quality and validation

Implement lightweight validation for:

- Schema correctness
- Unique IDs
- Required fields
- Valid category values
- Referenced scenario IDs
- Correction references
- Consistency of active versus superseded interpretations
- Explicit marking of incomplete observations
- No hidden opponent hands presented as known information

Add a short, focused test suite for these validations.

Avoid broad unrelated refactoring.

## 8. Prepare for continued expert interviews

Create a reusable template for adding new scenario discussions.

The template should capture:

- Scenario number and topic
- Rung caller and whether call was forced or voluntary
- Rung hidden or revealed
- Known trump suit, if revealed
- Player position and current trick
- Expert's cards
- Public card history
- Confirmed voids
- Suspected shortages
- Expert's selected card
- Alternative moves considered
- Reasoning
- Exceptions
- Confidence expressed by the expert
- Corrections to previous knowledge
- Information missing for training

Record that Scenario 21, involving post-reveal strategy with diamonds as trump, was presented but **not yet answered by the expert**.

Do not invent its answer.

## 9. Deliverables

When finished:

1. Provide the branch name and PR link.
2. Summarise all knowledge categories captured.
3. Identify game mechanics that required verification.
4. List unresolved ambiguities without inventing answers.
5. Explain how the knowledge base can feed the existing V3 data and training pipeline.
6. Confirm that production AI, scoring, game rules and canonical checkpoint remain unchanged.
7. Report the lightweight validation results.

Do not merge the PR automatically.

## Acceptance criteria

The result must faithfully represent the expert's reasoning, including all explicit corrections, without converting uncertain signals into facts or strategic preferences into rigid rules.

The knowledge base should be straightforward to extend as more scenarios are discussed.

**The immediate goal is to preserve high-quality human expertise. Training and runtime integration are separate future tasks.**