# PR #3: Experimental AI v2 with search-efficiency and matched-time evidence

Target `feature/advanced-strategic-ai`; retain **draft** status. Do not merge or change the production default.

Adds compact simulation with authoritative rule parity, constrained particle beliefs, single-observer ISMCTS, soft-budget hybrid/public-endgame routing, and isolated experimental policy/value learning. The search refinement reuses validated compact particle templates, avoids historical DTO allocation, strengthens concealed-metadata redaction and information-set keys, and evaluates a separate observation-only control rollout.

Validation: locked dependency installation from the implementation stage; both TypeScript checks; **256 tests across 27 files**; production build; **14/14 tactical cases**; **18,664 differential transitions** plus targeted rare-rule tests. The existing Vite chunk-size warning remains. Adversarial tests cover real hidden-hand swaps, feasible-world equivalence, concealed Ace/debug/winning-card aliases, public reveal-state distinctions, template/sibling immutability, direct/DTO key equivalence and safe failure after successful simulations. Same-policy duels verify per-team configuration routing.

An alternating-order fixed-work probe reduced aggregate runtime about **20.4%** and adaptations from **3,840 to 939**, with identical root statistics/nodes. A fresh 1,000-pair **25 ms ceiling** control-versus-corrected comparison finished **1,041–959 (52.05%; paired CI 50.15–53.9%)**, with no invalid/aborted games or V2 fallbacks. This is a small configuration-specific gain, not a production promotion result: mean CPU use was 7.76 versus 1.86 ms, and the largest control decision was 84.8 ms despite the soft budget.

The independent direct rollout duel finished **194–206 (48.5%; CI 44.25–52.75%)** for control. It does not establish a stronger rollout. Load tests at 8/16/32 rooms show higher compute and queue waits for control; at 32 rooms p95 wait was 557 ms versus retained V2's 337 ms and corrected-search's 260 ms. Larger-cap 5/10/25 ms development sweeps are exploratory and reported separately.

Keep **corrected-search** as production default and the original **legacy rollout** as the V2 default. Control remains optional. Neural models remain experimental; no new training or checkpoint guidance is introduced in the refinement. The original tiny value head still does not bootstrap search. No authoritative rules, Socket.IO contracts or dependencies change. Canonical SHA256 remains `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

Reports: `docs/AI_V2_ARCHITECTURE.md`, `docs/AI_V2_EVALUATION.md`, and `docs/AI_V2_SEARCH_REFINEMENT.md`. Machine-readable paired outcomes, raw hashes, calibration, root diagnostics, throughput and load measurements are under `benchmarks/` with reproducible scripts. Remaining limitations include non-uniform proposals, approximate marginal rollout forecasts, residual single-observer determinization bias, low work budgets, soft deadlines and higher room waiting.

GitHub API access has returned `Forbidden` in this environment. This file is the intended PR description for manual application if API editing remains blocked. No ready-for-review or merge operation has been issued.
