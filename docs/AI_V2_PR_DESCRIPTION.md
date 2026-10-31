# PR #3: Experimental AI v2 compact simulator and information-set search

Target: `feature/advanced-strategic-ai` (Phase 2 is not merged into `main`). Keep this PR **draft**. Do not merge or promote the live default.

Implements a compact typed-array trick simulator with authoritative differential parity, isolated hard/soft particle beliefs, single-observer ISMCTS with action availability and atomic completed-path statistics, a soft-budget hybrid controller with public exact endgame integration, and a versioned experimental policy/value imitation pipeline. Existing policies, Socket.IO contracts, authoritative rules, dependencies and canonical checkpoint remain unchanged. Server opt-in: `BOT_DECISION_POLICY=ai-v2-ismcts`; production remains corrected-search.

Validation: locked `npm ci`, both TypeScript checks, all **230 tests / 25 files**, production build, 14 tactical cases and the >=10,000-transition parity gate pass. The parity probe checks 18,664 reachable transitions and targeted challenge, Ace, KHOTI and endgame fixtures. Existing Vite chunk warning remains.

Frozen fresh held-out comparison: **1,071–929 (53.55%; paired 95% CI 51.65–55.4%)** over 1,000 paired deals, zero invalid/aborted games and search failures. This is a modest fixed-work improvement, not a production promotion result. Matched 25 ms: **212–188 (53%; CI 49–57%)**, inconclusive. Average computation and queued waiting increase under 8/16/32-room load. Corrected-search must remain the default.

Learning is explicitly experimental: 249 training samples, separate validation, atomic hashed checkpoints and validated resume confined to ignored experiments paths. Policy-only play is weak (31% in a 50-pair development comparison); validation value MSE is worse than the zero baseline. Value-head bootstrapping is deliberately deferred rather than replacing authoritative terminal rollouts. Small guided-search and ablation samples are not strength claims.

Confirmed limitations: non-uniform matching prior, weak opponent model and mismatch sensitivity, residual single-observer determinization bias, low particle count, heuristic adaptive allocation, rare public-only exact eligibility, soft deadlines, increased room waiting and poor tiny-model generalization. Full multi-hand diagnostics are small and reported separately.

See `docs/AI_V2_ARCHITECTURE.md`, `docs/AI_V2_EVALUATION.md` and `benchmarks/ai-v2-results.json` for rule inventory, information boundaries, commands, version/model/dataset hashes, paired outcomes, all ablations, calibration, representative root visits/values, complete matches and both load experiments. Canonical SHA256 stays `66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3`.

Delivery limitation: GitHub API returns `Forbidden` in this environment. Branch pushes update the existing PR's commits, but API-based description/draft-status verification is blocked. This file is the intended PR description for manual application; no ready/merge operation has been issued.
