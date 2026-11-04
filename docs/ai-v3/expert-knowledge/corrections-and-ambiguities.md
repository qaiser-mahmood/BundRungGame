# Corrections and unresolved context

The six rejected interpretations are machine-readable in `expert-principles.json` as `COR-01`–`COR-06`, with source quotations and active replacements. They are not competing active strategies.

| Correction | Rejected interpretation | Preserved correction |
| --- | --- | --- |
| COR-01 | Always return partner's signalled suit | Weigh team coverage, own preserved strength, opponent coordination and reveal risk (EK-E1/I1/L1). |
| COR-02 | A♥ win then clubs means heart shortage | Subsequent low clubs may suggest **club** shortage; Ace win may be natural/forced (EK-F1). |
| COR-03 | Many outstanding clubs favor repeated club leads | Generally less attractive without commanding high-card control; five is not a universal cutoff (EK-M1). |
| COR-04 | Always use lowest winning card | Consider retained strength, remaining-player risk and exact Ace interaction (EK-C1/B1/B2). |
| COR-05 | Confirmed opponent void justifies overtaking partner | In the Q♥/A♥/3♥ case expert still prefers 3♥; retain possible exceptions only as unresolved, not equal recommendations (EK-K1/EX-K1). |
| COR-06 | Low-card signals are facts | Treat as uncertain unless public evidence establishes a fact (EK-F1/F2). |

## Questions to ask, not answers to invent

1. **Preserve versus explore A♠/9♠/3♠:** section D prefers a different suit; H prefers 3♠ in an untouched suit. Which caller/reveal/alternative-suit/distribution conditions select each? Both conditional preferences remain active and cross-linked.
2. **Low-club inference:** after A♥ then 2♣, is the intended claim singleton-before-lead, void-after-lead, general weakness, or a request? The source says *possible* current void. No hidden count or intention label is established.
3. **Voluntary caller prior:** how does this vary with bidding mode, five-card information and alternatives? Dealer identity alone is not proof of a forced call; the engine's three-pass condition matters.
4. **Ace examples:** what are the preceding winning rank, turn order, remaining cards, reveal state and outstanding suit ranks? The engine checks previous **winner and next lead**, not arbitrary consecutive Ace plays. Interchangeability of A♦/Q♦ after K♦ is scenario-specific.
5. **Partner control exception:** which actual observable state would justify overtaking a winning partner? A possible dangerous next lead was suggested earlier; the later explicit preference for 3♥ remains stronger, including with a confirmed opponent heart void.
6. **Void proof:** which public action establishes each claimed void? Caller locked-card availability can complicate suit absence. Narrative assumptions must not be promoted to public observations without proof.
7. **Repeated leads:** which commanding high-card combinations and distributions support two or three leads? No fixed five-card threshold is endorsed.
8. **Streak terminology:** same individual opponent of caller matters for early victory, not any team winning consecutive tricks. Is a scenario about caller team support, opponent streak prevention, or general lead control? Do not silently substitute one for another.
9. **Scenario 21:** diamonds are revealed trump; expert has not answered. Hand, current trick, caller, public history and selected action are missing. Ask the expert; do not supply a likely answer.

The supplied summary is the primary evidence available here. Recovering original transcripts or complete legal states is future work. No specific original scenario numbers other than 21 have been inferred, and no invented numerical confidence or action probabilities are assigned.

## Relationship to earlier V3 hypotheses

The earlier V3 implementation contract and hypothesis guide included a possible previous-suit interpretation after a high win and different low lead. That is not the expert's clarified A♥ then 2♣ narrative: this package records possible **club** shortage and rejects heart shortage as the interpretation of that example. The hypothesis guide now links here and reflects the correction. The historical implementation contract remains unchanged; it is not a source of new expert labels. Likewise, its broad take-control possibility must not override the later winning-partner clarification.
