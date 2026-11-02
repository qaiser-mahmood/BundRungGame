# First synthetic V3 training

Run on Windows CPU with Node/tsx and no new dependencies:

```
node --import tsx scripts/v3-first-training.ts --output server/ai/models/experiments/v3/first-training-mixed
node --import tsx scripts/v3-gameplay.ts server/ai/models/experiments/v3/first-training-mixed/checkpoint.json server/ai/models/experiments/v3/first-training-mixed/gameplay.json
```

Use a fresh output directory when repeating; existing artifacts are never overwritten. Defaults: seed 763300, 80/16/24 train/validation/holdout deals, 20 epochs, learning rate .015/sqrt(epoch). A single affine softmax layer has 629 inputs and 52 outputs. Legal masking applies during training and inference. Validation loss selects epoch 3; holdout is evaluated only after selection. The historical 519-feature expert baseline remains separate and unchanged.

Synthetic labels come directly from V2 ISMCTS with control rollouts, 8 iterations, 4 particles, no deadlines, no exact solver and no adaptive budget. The generator seeds both engine randomness and V2 sampling. Cohorts cycle by deal seed modulo three: close trump, open trump announced through the engine, and Bwinji declared through bidding. Close calling uses the existing mixed forced/voluntary setup. Forced engine transitions remain authoritative. Observation extraction receives only public state and the actor's private state, including caller suit/locked card and own concealed memory. Initial ownership fingerprints are used only for splitting, never as features. Complete deals are assigned before generating samples; duplicate initial deals are rejected across all splits.

Results are in `benchmarks/v3-first-training/`. The checkpoint is 385,863 bytes and contains real learned weights, feature names/schema, seed/configuration, teacher options, generation source commit, dataset digest and split deal keys. Its SHA256 is `56050bbcd02a6e30b2832c69170f2483e41f78461181545d92f0cc252cf77d66`. The small checkpoint and reports are versioned; temporary synthetic rows remain in the ignored experimental directory. A child Node process reloads it and must reproduce all holdout actions. Reports retain the original local execution path; the published checkpoint copy is `benchmarks/v3-first-training/checkpoint.json`.

| Split | Deals | Samples | Cross entropy | Teacher agreement |
|---|---:|---:|---:|---:|
| Train | 80 | 2678 | .5719 | 82.37% |
| Validation | 16 | 523 | .8418 | 69.60% |
| Holdout | 24 | 652 | .8458 | 71.78% |

Legal compliance is 100% across every split and reported slice. Holdout caller/noncaller agreement is 58.60%/75.96%; hidden/revealed agreement is 61.90%/74.65%. Holdout contains 188 open-trump, 128 Bwinji and 336 close-trump decisions (8 deals each). Samples include 661 forced single-card decisions across the complete dataset; agreement therefore includes trivial decisions. Generation took 7.401 seconds, training including per-epoch metrics took 1.706 seconds, and final holdout scoring took 9.703 ms for 652 rows (two forward passes per row). Timings are machine-dependent. V2 recorded 0 fallbacks, 0 invalid worlds and 0 deadline stops during generation.

Gameplay used seeds 981000–981005, both team assignments per seed, V3 direct card policy versus the same small-budget V2 teacher. Result: 5 wins, 7 losses, 0 ties, 0 invalid moves, 0 errors. These are deals rather than full matches. Shared engine reveal/forced handling is outside the learned card policy. This small test does not establish superiority; imitation is not evidence of stronger gameplay. Bidding and reveal decisions are not learned. Face-down special-mode variants are not deliberately stratified in this first run.

Local expert pilot metadata was inspected: its exported corpus is `bundrung-v3-strategy-features/v1`, so no expert rows were imported, converted or used in evaluation. No expert files or UI were changed.

Validation: AI TypeScript check passed; 13 observation/teacher tests passed, including deterministic generation, all mode coverage, deal isolation, legal label mapping and legacy shape rejection. The broader focused suite passed 30/31 tests; the existing historical checkpoint symlink test fails with Windows EPERM even outside the sandbox. Existing private-information boundary tests pass.

Next experiment: increase deal diversity at the same teacher budget and report agreement restricted to decisions with multiple legal actions, with caller-hidden states stratified, before spending on a larger model.
