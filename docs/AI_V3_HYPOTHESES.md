# Hypothesis guide — not training labels or legal fixtures

The following examples describe possibilities from the V3 contract. They do not specify full hands, a valid chronological deal or a correct card. Annotators must use the actual generated observable packet and may disagree or abstain. No expected card/action/intent label is supplied by this guide.

| Hypothetical cue | Possible interpretation | Counterexample / disambiguating evidence |
| --- | --- | --- |
| Partner wins, then leads a low suit against the caller | A request to return a short suit and pressure reveal | Only low cards were available; a safe exit, not a signal |
| Partner leads high | Intends to win and repeat the suit | Protecting the team from an immediate loss; no repeat request |
| Partner returns the same suit repeatedly | Trying to exhaust holdings | Following forced legal suits, or preserving another control card |
| High Ace win followed by a different low suit | New suit shortage or a request to return the previous suit | The previous suit may be the actual shortage; count remaining possible cards |
| Partner does not win | May be waiting to communicate useful shortage | Cannot know unplayed legal alternatives; losing alone proves no intention or lack of high cards |
| Our team called rung; partner leads weakly and observer has support | Observer may take control and switch | Winning now could expose trump or spoil an eligible individual streak |
| Our team called rung; both appear weak in that suit | Returning it might exhaust cards | Opponent can force reveal immediately; concealment risk may dominate |
| Revealed trump and one eligible opponent individual win | Same-player consecutive control is important | First trick is excluded; caller-team wins do not qualify; final-trick team outcome may supersede personal control |
| Caller plays a trump-suit card before reveal | Potential weakness or concealment-management choice | Could be forced, abundant suit length, or a misleading ordinary discard; never a certainty |
| Few played cards in a suit or visible outstanding high cards | Future control opportunities | The partner/opponent may be void and ruff; an Ace lead can be downgraded |

Stage-A software tests verify observable distinctions, redaction and absence of automatic intention labels. Ranking accuracy, probability calibration and these strategic hypotheses require actual expert annotations and later independent model evaluation. They are not claimed as passed expert-strategy tests now.
