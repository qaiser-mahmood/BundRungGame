# Bund Rung expert partnership strategy guide

Knowledge version 1.0.0. This guide summarizes the supplied human discussion consolidation. Preferences remain conditional; inferred signals are uncertain. See [source and limitations](README.md), [corrections](corrections-and-ambiguities.md) and [raw source](expert-source.md). No runtime policy is implemented.

## Verified mechanics, separately from strategy

Engine verification is pinned to V3 base commit `716d4361ac1e45f6f504c49fb37917e44165dc2a`. Line numbers are anchors at that commit, not promises about future versions. These findings verify implemented behavior, not an independent external rulebook.

## GM-ACE: mechanics

Classification: `verified_game_mechanic`; phase: `next_trick_lead`; certainty: `engine_verified`.

**Context:** Same player won preceding trick with rank A; leads another rank A; current trick number >1.

**Preference or mechanic:** Engine marks new Ace isAceDowngraded and resolves it at effective power 2.

**Reasoning:** Exact implemented condition; not any consecutive Ace plays and not a blanket prohibition. Intended benefit: Accurate explanation only; no engine change.

**Limits:** Off-lead Aces do not meet this condition; suits need not match; condition is not restricted to revealed rung.

**Engine:** `server/engine/BundRungEngine.ts` — `playCard / resolveTrick`, lines 1184–1200; 1302. Boolean lead/winner/rank conditions and getCardPower downgrade.

**Evidence:** source C: “Verify the exact conditions and implementation in the official engine.”

## GM-FORCED: mechanics

Classification: `verified_game_mechanic`; phase: `bidding`; certainty: `engine_verified`.

**Context:** No rung selected and three bidders have passed; dealer is fourth bidder.

**Preference or mechanic:** Engine refuses another PASS; dealer must select rung or Bwinji.

**Reasoning:** biddingPassCount === 3 guard. Intended benefit: Distinguish forced declaration fact from a strength prior.

**Limits:** Being dealer alone does not establish that a particular call was forced.

**Engine:** `server/engine/BundRungEngine.ts` — `submitBid`, lines 572–587. Fourth bidder PASS throws; strength is not verified by this rule.

**Evidence:** source A1: “If the rung caller is also the dealer and must call, their hand may be weak.”

## GM-FOLLOW: mechanics

Classification: `verified_game_mechanic`; phase: `following`; certainty: `engine_verified`.

**Context:** Current actor has legal available lead-suit cards.

**Preference or mechanic:** Engine requires following suit; legal non-follow can support void evidence in available lead suit.

**Reasoning:** Matching-suit filtering precedes arbitrary discards. Intended benefit: Conservative public void evidence.

**Limits:** Before reveal caller locked card is unavailable except last forced play; failure to follow does not prove absence of that suit in the locked slot. Concealed card suit must not be inferred from inaccessible identity.

**Engine:** `server/engine/BundRungEngine.ts` — `getLegalCardsForPlayer`, lines 1062–1106. Includes revealed locked trump or last caller turn, matching-suit filter and reveal gating.

**Evidence:** source 5: “An opponent failing to follow suit may establish a confirmed void, subject to official rules.”

## GM-REVEAL: mechanics

Classification: `verified_game_mechanic`; phase: `hidden_trump`; certainty: `engine_verified`.

**Context:** Current opponent of caller is void in established lead suit, rung hidden, not pending or paused, TRICK_PLAYING.

**Preference or mechanic:** Reveal permission arises; engine blocks playing a hand card before reveal. After reveal a revealer with trump must play trump when void in lead suit.

**Reasoning:** Official permission and legal-card checks. Intended benefit: Explain strategic reveal opportunities without changing mechanics.

**Limits:** A suspected void is not permission; same-team caller partner cannot request via this condition; leading a suit alone is insufficient.

**Engine:** `server/engine/BundRungEngine.ts` — `getRevealPermissions / getLegalCardsForPlayer`, lines 1840–1865; 1093–1112. Actor/team/void/reveal-state checks; trump obligation follows matching suit.

**Evidence:** source G: “if that creates an opportunity to force reveal.”

## GM-STREAK: mechanics

Classification: `verified_game_mechanic`; phase: `post_reveal`; certainty: `engine_verified`.

**Context:** Rung revealed; current trick >=2; same individual wins two consecutive counted tricks; winner opposes caller.

**Preference or mechanic:** Engine resolves game for that opponent team; trick 1 and unrevealed completions reset qualifying streak.

**Reasoning:** Individual streak check, distinct from team trick counter. Intended benefit: Represent actual risk of conceding consecutive wins.

**Limits:** A caller-team individual streak does not trigger early victory; alternating teammates do not qualify; absent early victory, trick 13 winner wins.

**Engine:** `server/engine/BundRungEngine.ts` — `resolveTrick`, lines 1354–1416. Individual tracking/reset and isOpponentEarlyWin; final-trick fallback.

**Evidence:** source J4: “Record the actual scoring consequences using the official scoring engine, not assumptions.”

## GM-SCORE: mechanics

Classification: `verified_game_mechanic`; phase: `resolution`; certainty: `engine_verified`.

**Context:** An official winning team has been resolved.

**Preference or mechanic:** Use scoring engine mode/modifier/caller-team/dealer-team matrix; do not add per-trick points for a prevented streak.

**Reasoning:** Game outcome feeds score adjustment and dealer score/transfer/Khoti handling. Intended benefit: Avoid invented fixed reward for each consecutive trick.

**Limits:** Bwinji/open modifiers differ; narrative examples do not supply enough context for a numeric score.

**Engine:** `server/engine/ScoringEngine.ts` — `calculateAdjustment / applyGameResult`, lines 64–128; 136–215. Close trump: dealer called => dealer win -13 / loss +26; other team called => dealer win -26 / loss +13; different matrices for open/Bwinji. Adjustment is dealer-score convention, not generic team utility.

**Evidence:** source J4: “Record the actual scoring consequences using the official scoring engine, not assumptions.”

## EK-A1: caller strength

Classification: `probabilistic_inference`; phase: `bidding`; certainty: `uncertain`.

**Context:** Caller is dealer and required to declare after preceding passes, versus a voluntary declaration.

**Preference or mechanic:** Use forced/voluntary status as probabilistic evidence; voluntary caller is considered more likely strong in selected trump.

**Reasoning:** A forced caller may not have a strong option. Intended benefit: Better uncertainty about caller support.

**Limits:** Voluntary does not prove strength; forced does not prove weakness.

**Evidence:** source A1: “This is probabilistic evidence, not certainty.”

Open: How strongly should this prior vary by bidding mode and five-card declaration information?

## EK-A2: partner control

Classification: `expert_strategic_preference`; phase: `any_trick`; certainty: `context_dependent`.

**Context:** Partner called rung and is already winning.

**Preference or mechanic:** Generally leave control with partner; avoid unnecessary overtaking, especially during consecutive-win planning.

**Reasoning:** Partner may retain useful control while our high cards are conserved. Intended benefit: Partnership control over future tricks.

**Limits:** Exceptional circumstances may justify taking control; not an absolute command.

**Evidence:** source A2: “Do not unnecessarily overtake a winning partner.”

Related: EK-K1, EK-J4.

## EK-B1: position risk

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Playing third; opponent still to act; partner 4♦ and opponent 8♦; own A♦ K♦ 10♦ 6♦.

**Preference or mechanic:** Prefer A♦ in the discussed position.

**Reasoning:** 10♦ may be overtaken by the remaining opponent. Intended benefit: Reduce remaining-player risk.

**Limits:** Not a universal highest-card rule; Ace downgrade, trump and public history still matter.

**Evidence:** source B1: “Expert prefers A♦ because 10♦ could be beaten by the remaining opponent.”

Related: EK-B2, EK-C1.

Narratives: SC-B1.

## EK-B2: position risk

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Playing fourth and 10♦ is sufficient to win the completed trick.

**Preference or mechanic:** May play 10♦ and preserve stronger cards.

**Reasoning:** There is no remaining player to overtake this play. Intended benefit: Efficient use of suit strength.

**Limits:** Future suit control and Ace interaction can change the choice.

**Evidence:** source B2: “This is context-sensitive.”

Related: EK-C1, EK-N1.

Narratives: SC-B2.

## EK-C1: ace management

Classification: `expert_strategic_preference`; phase: `any_trick`; certainty: `context_dependent`.

**Context:** Considering multiple currently winning cards.

**Preference or mechanic:** Consider retained suit strength and possible consecutive-lead Ace downgrade; no universal lowest-winner or Ace-first rule.

**Reasoning:** A King retained after an Ace can offer different future control from a Jack retained after an Ace. Intended benefit: Plan future winners without making Ace avoidance the sole objective.

**Limits:** A♦/K♦ example differs from A♦/J♦ example; Q♦ may be interchangeable after K♦ played.

**Evidence:** source C1: “The expert treats avoiding a double-Ace disadvantage as a preventive consideration, not the overriding objective.”

Related: GM-ACE, EK-N1.

Narratives: SC-C1, SC-C2, SC-C3.

Open: Exact trick context and already-played cards for each example remain unspecified.

## EK-D1: suit preservation

Classification: `expert_strategic_preference`; phase: `leading`; certainty: `context_dependent`.

**Context:** Holding high-card strength in a suit.

**Preference or mechanic:** Often explore a different suit and preserve strong cards; after A♠ win, may switch and retain K♠.

**Reasoning:** Strong cards may later defend against an opponent streak. Intended benefit: Future control rather than demonstrating strength.

**Limits:** Untouched-suit exploration with 3♠ is also preferred in another context; neither is unconditional.

**Evidence:** source D1: “Avoid spending strong cards merely to demonstrate strength.”

Related: EK-H1, EK-J4.

Narratives: SC-D1, SC-D2.

Open: Which context selects another suit versus low-spade exploration with A♠ 9♠ 3♠?

## EK-E1: partnership coverage

Classification: `expert_strategic_preference`; phase: `any_trick`; certainty: `context_dependent`.

**Context:** Assessing own weakness and possible partner coverage.

**Preference or mechanic:** Evaluate combined team coverage; do not automatically return a low-card signal.

**Reasoning:** Individual weakness need not be team weakness. Intended benefit: Preserve team control and concealment.

**Limits:** Partner coverage is uncertain unless established publicly; never inspect hidden hands.

**Evidence:** source E1: “A suit that is weak for one partner may still be strong for the team if the other partner can cover it.”

Related: EK-F1, EK-I1.

## EK-F1: partner signals

Classification: `probabilistic_inference`; phase: `after_partner_lead`; certainty: `uncertain`.

**Context:** Partner wins A♥ then leads 2♣.

**Preference or mechanic:** Treat club shortage, possibly becoming void after the low club, as a hypothesis about clubs, not hearts.

**Reasoning:** The subsequent low-club play is the relevant cue; the Ace win may be natural or forced. Intended benefit: Contextual partner-intent inference.

**Limits:** 2♣ does not prove partner had only one club; concealed/remaining cards are unknown.

**Evidence:** source F1: “Partner wins with A♥ and then leads 2♣: expert interprets this as a possible indication that partner is now void in clubs, not hearts.”

Related: EK-L1, EK-E1.

Narratives: SC-F1, SC-L1.

Open: How should public count evidence change the belief?

## EK-F2: partner signals

Classification: `probabilistic_inference`; phase: `hidden_trump`; certainty: `uncertain`.

**Context:** Partner called hidden rung, wins then returns a low spade.

**Preference or mechanic:** Treat spade weakness and spades possibly not being trump as uncertain evidence.

**Reasoning:** Sequence may communicate weakness but is not a disclosure. Intended benefit: Update beliefs while retaining alternatives.

**Limits:** Caller can still have spade trump; win/lead may have been forced or natural.

**Evidence:** source F2: “evidence that spades may not be trump.”

Related: EK-F1, EK-A1.

Narratives: SC-F2.

## EK-G1: concealment

Classification: `expert_strategic_preference`; phase: `hidden_trump`; certainty: `context_dependent`.

**Context:** Our team called; opponent confirmed void in suit under consideration; e.g. singleton 7♦.

**Preference or mechanic:** Strongly avoid voluntarily leading that suit when it creates an opponent reveal opportunity.

**Reasoning:** A void opponent of the caller can reach the official reveal condition. Intended benefit: Protect hidden rung.

**Limits:** Suspected shortage is weaker evidence; a known void alone does not justify overtaking a winning partner.

**Evidence:** source G1: “A suspected shortage is less decisive than a confirmed void.”

Related: GM-REVEAL, GM-FOLLOW, EK-K1, EK-H1.

Narratives: SC-G1, SC-G2.

## EK-G2: card counting

Classification: `expert_strategic_preference`; phase: `hidden_trump`; certainty: `context_dependent`.

**Context:** Our team protects hidden rung.

**Preference or mechanic:** Count public played/outstanding cards, compare safer alternatives and preserve future stoppers.

**Reasoning:** Distribution and lead ownership affect reveal risk. Intended benefit: Control and defensive resources.

**Limits:** Unknown holder identities remain estimates.

**Evidence:** source G2: “Count outstanding cards and estimate who may hold them.”

Related: EK-M1, EK-N1.

## EK-H1: suit exploration

Classification: `expert_strategic_preference`; phase: `leading`; certainty: `context_dependent`.

**Context:** Spades untouched; own A♠ 9♠ 3♠; several spades remain in other hands.

**Preference or mechanic:** In the discussed context, prefer 3♠ and observe responses.

**Reasoning:** Explore distribution while retaining A♠. Intended benefit: Information and preserved strength.

**Limits:** Untouched does not guarantee safety; another context prefers exploring a different suit.

**Evidence:** source H1: “This is a strategic preference, not a guarantee that an untouched suit is safe.”

Related: EK-D1, EK-M1.

Narratives: SC-H1.

Open: What alternatives and reveal risks distinguish this from SC-D1?

## EK-I1: opponent signals

Classification: `expert_strategic_preference`; phase: `hidden_trump`; certainty: `context_dependent`.

**Context:** Our team protects hidden rung and opponent appears to request a suit.

**Preference or mechanic:** Avoid voluntarily helping opponents exploit that suit; weigh partner signals against this danger.

**Reasoning:** Returning a suit can help the opposing partnership reach a reveal or control opportunity. Intended benefit: Deny opponent coordination.

**Limits:** An inferred request is not a confirmed void.

**Evidence:** source I1: “A partner's signal is relevant but does not automatically override this danger.”

Related: EK-E1, EK-G1, EK-L1.

## EK-J1: partner control

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Partner Q♠ beats opponent 9♠; own K♠ 3♠.

**Preference or mechanic:** Play 3♠ in the discussed scenario.

**Reasoning:** Partner already wins; preserve K♠. Intended benefit: Save high-card control.

**Limits:** Unknown remaining player/trump/history could change a fully specified case.

**Evidence:** source J1: “Expert plays 3♠, allowing partner to win and preserving K♠.”

Related: EK-A2, EK-K1.

Narratives: SC-J1.

## EK-J2: take control

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Opponent Q♠ winning; own K♠ 3♠.

**Preference or mechanic:** Play K♠ in the discussed scenario.

**Reasoning:** Take control from an opponent. Intended benefit: Team control.

**Limits:** A currently winning K may not win against a later player or trump.

**Evidence:** source J2: “Expert plays K♠ to take control.”

Related: EK-B1, EK-J3.

Narratives: SC-J2.

## EK-J3: take control

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Partner Q♣ losing to opponent K♣; own A♣ 8♣ 3♣.

**Preference or mechanic:** Play A♣ in the discussed scenario.

**Reasoning:** Protect team control. Intended benefit: Prevent opponent win where the Ace succeeds.

**Limits:** Ace downgrade and any remaining player must be checked in a real state.

**Evidence:** source J3: “Expert plays A♣.”

Related: EK-J2, GM-ACE.

Narratives: SC-J3.

## EK-J4: streak defense

Classification: `expert_strategic_preference`; phase: `post_reveal`; certainty: `context_dependent`.

**Context:** Opponent is threatening another consecutive trick; a winning stopper is available.

**Preference or mechanic:** Strongly prefer stopping the opponent.

**Reasoning:** A qualifying individual opponent streak can end the game; retain stoppers for this risk. Intended benefit: Avoid official game loss, not merely improve trick count.

**Limits:** Qualification depends on caller side, same individual, reveal and trick index; caller-team streaks do not trigger that early-win condition.

**Evidence:** source J4: “the expert strongly prefers stopping them when a winning card is available.”

Related: GM-STREAK, GM-SCORE, EK-D1.

## EK-K1: partner control

Classification: `expert_strategic_preference`; phase: `following`; certainty: `context_dependent`.

**Context:** Partner Q♥ already winning; own A♥ 3♥, even with an opponent confirmed void in hearts.

**Preference or mechanic:** Prefer 3♥ and let partner retain control in the discussed scenario.

**Reasoning:** Preserve Ace and partner control; possible future reveal alone is insufficient reason to overtake. Intended benefit: Resources and partnership continuity.

**Limits:** A prior suggested take-control exception was not equally endorsed; extraordinary exceptions still need explicit context.

**Evidence:** source K1: “the expert subsequently clarified a strong preference for leaving control with the partner.”

Related: EK-A2, EX-K1, EK-G1.

Narratives: SC-K1.

## EX-K1: partner control

Classification: `conditional_exception`; phase: `following`; certainty: `unresolved`.

**Context:** Taking control might prevent a dangerous next lead; exact state absent.

**Preference or mechanic:** Do not apply as an active override of EK-K1; retain only as an unresolved exceptional possibility.

**Reasoning:** The later clarification gives stronger support to leaving partner in control. Intended benefit: Preserve nuance without restoring a rejected generalization.

**Limits:** Requires a new explicit expert-supported case; a confirmed void is insufficient by itself.

**Evidence:** source K1: “A previously discussed possible exception involved taking control to prevent a dangerous next lead”

Related: EK-K1.

Open: What exceptional observable state would justify overtaking?

## EK-L1: force reveal

Classification: `expert_strategic_preference`; phase: `opponent_called`; certainty: `context_dependent`.

**Context:** Opponents called; partner A♥ win then low 2♣; later we control lead.

**Preference or mechanic:** May return 4♣ to exploit possible partner club shortage, after assessing opponent voids and safety.

**Reasoning:** Partner might obtain a reveal opportunity as opponent of caller. Intended benefit: Create reveal opportunities for our team.

**Limits:** Not automatic; team coverage, opponent voids and alternatives may override.

**Evidence:** source L1: “the expert may return 4♣ to exploit that shortage.”

Related: EK-F1, EK-I1, GM-REVEAL.

Narratives: SC-L1.

## EK-M1: card counting

Classification: `expert_strategic_preference`; phase: `repeated_leads`; certainty: `context_dependent`.

**Context:** Considering repeated leads with many cards in that suit outstanding in other hands.

**Preference or mechanic:** Generally avoid repeated leads without enough commanding high cards for multiple wins.

**Reasoning:** Many outstanding cards create competition and distribution risk, not automatic opportunity. Intended benefit: Retain lead across realistic two/three-trick plans.

**Limits:** Several commanding highs can justify repetition; five outstanding is an example, never a universal threshold.

**Evidence:** source M1: “generally not with only Q♣ and 4♣.”

Related: EK-H1, EK-N1.

Narratives: SC-M1.

Open: Which public counts and high-card combinations support a specific repeated-lead plan?

## EK-N1: multi trick planning

Classification: `expert_strategic_preference`; phase: `any_trick`; certainty: `context_dependent`.

**Context:** Evaluating action sequences, retained cards and likely responses.

**Preference or mechanic:** Plan beyond immediate trick wins: retain K♦ after A♦, explore Q♥ or J♣, save A♠, assess future voids and same-player continuation.

**Reasoning:** Current winning probability does not capture future control, reveal exposure and streak risk. Intended benefit: Official team outcome over multiple tricks.

**Limits:** No exact plan is mandated without full observable state and legal actions.

**Evidence:** source N1: “The expert regularly plans more than one trick ahead.”

Related: EK-C1, EK-D1, EK-M1, GM-STREAK.

Narratives: SC-N1.

## Narrative examples

Every example remains incomplete and unsuitable for training. Null values in the JSON mean unknown, not an invitation to infer hidden state. Local IDs are editorial.

| ID | Supplied expert response |
| --- | --- |
| SC-B1 | Prefer A♦ to reduce risk from the opponent still to act. |
| SC-B2 | May use 10♦ if sufficient to beat all other played cards; preserve stronger cards. |
| SC-C1 | Win with A♦ while retaining K♦ as a strong diamond. |
| SC-C2 | If J♦ suffices, retain A♦; Jack does not provide comparable future control. |
| SC-C3 | A♦ and Q♦ considered interchangeable here. |
| SC-D1 | Prefer exploring another suit; the alternative suit/card was not specified. |
| SC-D2 | Switch suits, preserving K♠ for later defensive control. |
| SC-F1 | Possible current club shortage/void after low club; do not label hearts short from the Ace win. |
| SC-F2 | Infer possible spade weakness and possible non-spade trump, without certainty. |
| SC-G1 | Strongly avoid leading singleton 7♦ into confirmed opponent void. |
| SC-G2 | May consider diamonds if opponent only suspected short, after assessing safer alternatives. |
| SC-H1 | Lead 3♠ to test untouched spades and retain A♠. |
| SC-J1 | Leave winning partner in control, preserve K♠. |
| SC-J2 | Take control from winning opponent Q♠. |
| SC-J3 | Play A♣ to protect team control. |
| SC-K1 | Preserve A♥ and let partner win; future reveal risk alone does not justify overtaking. |
| SC-L1 | May return 4♣ to exploit possible partner club shortage; assess opponent voids and safety first. |
| SC-M1 | Generally avoid repeated club leads without sufficient commanding high cards; five is not a fixed threshold. |
| SC-N1 | Consider exploratory Q♥ or J♣ while preserving A♠ as part of multi-trick planning. |
| SC-21 | UNANSWERED. Revealed diamonds trump only; no expert answer recorded. |

## Official scoring consequences

Conceding a qualifying individual opponent streak resolves the game; there is no separate fixed point award for each trick in that streak. `resolveGame` passes the winning team to `ScoringEngine.applyGameResult`. In Close Trump, if the dealer team called, dealer win adjusts dealer score by −13 and dealer loss by +26. If the other team called, dealer win adjusts by −26 and dealer loss by +13. These signs are **dealer-score accounting**, not generic team utility. Open/Bwinji modifiers use different matrices; score thresholds govern transfer/Khoti. Narrative examples lack enough context to assign numeric game rewards.

## Future use

Use this as expert interview and counterexample guidance for the existing observable-packet V3 workflow. Obtain genuine complete snapshots, legal-action rankings and human belief labels before supervised training. Do not infer certain intentions from low cards, convert narrative actions into fabricated annotations, or train on a deterministic decision tree distilled from these preferences.
