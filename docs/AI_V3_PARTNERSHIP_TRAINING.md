# V3 nonlinear partnership experiment

The experiment executed successfully, but **does not demonstrate a stronger player**. Retain the incumbent policy. The regularized MLP improves held-out imitation and partnership agreement, ties the original V3 in gameplay, and loses to V2 and the heuristic. No production policy, game rule, expert UI, private expert record or PR #10 checkpoint was changed.

Artifacts are in `benchmarks/v3-partnership-training/`. `experiment.json` contains the baseline, teacher benchmarks, all training histories, selection evidence, split/coverage counts, final slices and gameplay summaries. `paired-games.jsonl` preserves each seed pair's outcomes, scores, trick differences, partnership events and trump counts. Full execution records and generated deal shards remain in the ignored experimental directory.

## Executed training and data

The MLP is **629 → 256 → 128 → 52**, ReLU, **200,884 parameters**, masked softmax and teacher-action cross entropy. Training uses NumPy 2.2.3/OpenBLAS already installed on this machine; no heavyweight framework was installed. TypeScript inference has no added runtime dependency. Optional Python dependency installation is specified in `scripts/requirements-v3.txt`.

The retained experimental checkpoint uses Adam (β1=.9, β2=.999, ε=1e-8), batch 256, rate .0005 halved every 10 epochs, matrix weight decay .001, hidden dropout .15, seed 763302 and patience 6 on validation cross entropy. Training ran 37 epochs in **36.504 seconds**, selecting **epoch 31**. CPU: Intel Core i5-10210U, 4 cores/8 logical processors, 15.8 GiB RAM; two BLAS threads, no GPU. The initial unregularized full MLP took 10.847 seconds and the same-data linear comparator 4.215 seconds.

Exact main commands executed:

```powershell
node --import tsx scripts/v3-partnership-data.ts --deals 1000,150,250 --teacher selective32 --output server/ai/models/experiments/v3/partnership-full
python scripts/v3_train_mlp.py --dataset server/ai/models/experiments/v3/partnership-full --output server/ai/models/experiments/v3/partnership-full-mlp-regularized --dropout .15 --rate .0005 --decay .001
node --import tsx scripts/v3-partnership-data.ts --seed 2600300 --deals 0,0,250 --teacher selective32 --output server/ai/models/experiments/v3/partnership-audited-holdout
```

Use fresh output directories for a new experiment; existing checkpoints are not overwritten. Data generation resumes complete per-deal shards and can extend split counts without moving existing seeds between splits. The default full data seed is 1500300, with split offsets 0/1,000,000/2,000,000. Every shard has a hash; duplicate initial deals, duplicate feature states within a deal, illegal labels, invalid visits and cross-split deal reuse are rejected. The generator records the source commit, normalized generator source hash, teacher identifier, configuration and dataset digest. Checkpoints additionally record the training-source hash and split deal fingerprints. New source commits or output paths change provenance metadata and therefore the complete checkpoint hash; seeded numerical training is reproducible in the recorded environment.

The pilot used 100/20/20 deals, seed 1700300. The hard-label MLP's validation loss was 1.0247 versus 1.0268 for an 80% selected-action / 20% genuine search-visit mixture. Hard labels were retained. Visits were collected from actual V2 root search; no action values or counterfactual team outcomes were fabricated. After the unregularized full MLP overfit early, the regularized variant was chosen using validation only. Separate 200-game selection tests gave 100–100 against the retrained linear policy and 103–97 against original V3. This did not justify replacing the incumbent. `selection.json` locked the experimental candidate and final gameplay protocol before final scoring.

### Holdout audit

The first throughput probe accidentally reused three initial deals in the development holdout pool. The original baseline was scored on those probe deals before architecture selection. All `development-holdout-*.json` results are therefore explicitly exploratory. To obtain a clean final evaluation, the already locked weights were evaluated on **250 fresh deals**, seeds **4600300–4600549**. No further fitting or model selection followed. Final reports use the `final-holdout-` prefix; the report audit verifies zero initial-deal overlap with training, validation, the development pool and gameplay. The checkpoint's training-manifest provenance describes the original fitting corpus; `experiment.json.finalDataset` separately binds the fresh final evaluation corpus.

| Split used in final reporting | Deals | Samples | Multiple legal actions | Close/open/Bwinji deals | Close/open/Bwinji samples |
|---|---:|---:|---:|---|---|
| Training | 1,000 | 37,043 | 30,310 | 334 / 333 / 333 | 14,024 / 11,011 / 12,008 |
| Validation | 150 | 5,866 | 4,779 | 50 / 50 / 50 | 2,172 / 1,802 / 1,892 |
| Fresh final holdout | 250 | 8,952 | 7,333 | 83 / 84 / 83 | 3,412 / 2,920 / 2,620 |

The initial 1,400-deal development corpus (including the superseded 250-deal holdout) contains 52,102 rows and took **217.181 seconds**, approximately **6.45 deals/s** or **240 rows/s**. Fresh final holdout generation took **36.020 seconds**. Caller selection cycles through zero to three passes; suits and locked/lead cards are seeded choices, including weak and strong hands. Coverage spans early/middle/late play, all trick positions, hidden/revealed trump, caller/noncaller and 5,903 nontrivial partner-winning training decisions. Full hand-strength and suit-length histograms are reported. The first open-trump announcement is an engine action and not an imitation row. Face-down special-mode variants are not deliberately stratified.

## Teacher selection and boundaries

Before the pilot, 18-deal generation probes measured 10.76 deals/s for weak8, 5.22 for selective32 and 2.88 for selective64. On 60 separately seeded paired games against weak8, selective32 won 34 and selective64 won 31. These small samples do not prove that either search setting is stronger. Selective32 was chosen for its measured cost/result tradeoff. A subsequent, separately reported diagnostic against the heuristic was **88–112 over 200 games**, 44.0% wins, paired 95% interval 39.5–48.5%. The teacher itself remains a strength bottleneck.

All teachers use existing V2 ISMCTS and control rollouts. Weak8 uses 8 iterations/4 particles, adaptive=false. Selective32 uses a configured maximum of 32 iterations/8 particles for partner-winning states, hidden-trump states with at least three legal actions, or estimated hold-probability margins below .15; other decisions use 8/4. Adaptive V2 allocation remains enabled for selective teachers, so actual completed visits can be lower than the configured maximum, and obvious last-seat decisions can bypass search. Selective64 raises difficult budgets to 64/16. All use timeMs=Infinity and exact=false for deterministic budgeting. Reported histograms distinguish configured budgets and actual root visits. Generation and gameplay abort on V2 fallbacks, invalid worlds, deadline stops, illegal actions or incomplete games; every completed run had zero such errors.

Models receive only the unchanged 629-feature actor observation. Caller-private suit/locked card and own concealed memory are retained legitimately; opponent hands, future cards, referee state, outcome tags and deal fingerprints never enter inputs. Partnership diagnostics use public trick evaluation and the actor's known cards. They do not override network decisions or impose a blanket ban on overtaking. The historical 519-feature pipeline is unchanged.

## Final imitation results

| Policy | Train loss/agreement | Validation loss/agreement | Fresh holdout loss/agreement | Fresh holdout multi-action agreement |
|---|---|---|---|---:|
| Original PR #10 linear | Preserved original report | 1.1628 / 59.55% | 1.1539 / 60.19% | 51.40% |
| Retrained linear | .8914 / 66.64% | .9714 / 62.56% | .9780 / 64.22% | 56.32% |
| Regularized MLP | .8135 / 69.64% | .9380 / 64.90% | .9388 / 66.52% | 59.13% |

| Fresh holdout slice | Samples | MLP agreement |
|---|---:|---:|
| Caller / noncaller | 2,175 / 6,777 | 60.64% / 68.41% |
| Hidden / revealed trump | 1,701 / 7,251 | 53.09% / 69.67% |
| Close / open / Bwinji | 3,412 / 2,920 / 2,620 | 60.08% / 71.58% / 69.27% |
| Leading / second / third / fourth seat in trick | 2,175 / 2,259 / 2,259 / 2,259 | 52.69% / 74.24% / 71.54% / 67.11% |
| Partner currently winning | 1,907 | 70.27% |
| Partner winning, multiple actions | 1,466 | 61.32% |

Legal compliance is **100%** for every reported split and slice. Fresh holdout inference averaged approximately **0.26 ms/decision** on CPU, including input checks, with one forward pass per row. Fresh Node subprocesses verified exported probabilities against NumPy (maximum discrepancy below 1e-5) and identical actions on validation probes. Original V3 partner-winning agreement was 52.86%; the MLP overtook 531 times versus the teacher's 401 on those 1,907 fixed situations. Better imitation still leaves systematic disagreement, especially in hidden trump and leading decisions.

## Final paired gameplay

Each main comparison uses seeds **9300000–9300299**, both team assignments: **600 complete deals, 300 independent seed pairs**, exactly 200 games per mode. Initial deal hashes must match within a pair. The same authoritative engine, rules and forced reveal/accept transitions are shared by every policy. Confidence intervals resample whole seed pairs with the existing 5,000-sample bootstrap. Games are complete deals, not full matches; a null winner is a tie, while incomplete games are errors and abort the run.

| MLP versus | Wins–losses–ties | Win rate | Paired 95% interval | Mean signed score |
|---|---|---:|---|---:|
| Original V3 linear | 300–300–0 | 50.00% | 47.67–52.33% | +1.170 |
| Selective32 V2 teacher | 222–378–0 | 37.00% | 34.17–39.83% | −11.115 |
| Existing BotPlayer heuristic | 210–390–0 | 35.00% | 32.17–37.83% | −13.390 |
| Retrained linear | 299–301–0 | 49.83% | 47.83–51.83% | 0.000 |

All comparisons had **zero invalid moves and zero incomplete games**. Against V2, close/open/Bwinji win rates were 33.5%/39.5%/38.0%, each with 200 games. Overall mean trick differential was −.02 despite the negative game score: winning individual tricks is not the game's full team objective. Gameplay MLP latency was approximately .42–.64 ms per decision across these runs, which included concurrent CPU work; use the isolated holdout scoring timing for a cleaner inference estimate.

The original V3 control scored 211–389 against the same V2 on the same seed pairs. MLP improvement was **+1.83 percentage points**, paired 95% interval **−1.00 to +4.83 points**. This does not establish superiority.

Against V2, MLP partnership opportunities numbered 2,341: 468 overtakes and 1,873 conserves. The team subsequently won the trick in 382/468 overtake cases and 1,630/1,873 conserve cases; corresponding final game wins were 159 and 767. Original V3 had 2,191 opportunities, 527 overtakes and 1,664 conserves, with 437/527 and 1,437/1,664 trick wins. These conditional counts are observational: the states and available choices differ, so lower overtaking frequency is not evidence of better teamwork. MLP used known trump on 2,384/8,908 decisions, including 793 high-trump uses; per-mode and comparator counts are in the reports.

## Checkpoints, verification and next step

The experimental MLP is `benchmarks/v3-partnership-training/checkpoint.json`, **4,417,845 bytes**, SHA256:

```
1b45e9a136c154e005a6fbdeff2e035cc2446802be3e8530af2669a29fe3ce83
```

`retrained-linear.json` is the 32,760-parameter same-data comparator, SHA256 `318da217d7ac6f2454ead365f630ce7062d6b7f5c91ead5edacfbbc4e76a9992`. Original PR #10 remains at `benchmarks/v3-first-training/checkpoint.json`, with unchanged SHA256 `56050bbcd02a6e30b2832c69170f2483e41f78461181545d92f0cc252cf77d66`. All three are suitable for ordinary Git. Unselected pilot/unregularized weights remain locally in their recorded ignored output directories; their checksums are in `experiment.json.fits`.

Example final scoring and gameplay commands (use fresh report filenames when rerunning):

```powershell
node --import tsx scripts/v3-partnership-evaluate.ts server/ai/models/experiments/v3/partnership-audited-holdout benchmarks/v3-partnership-training/checkpoint.json holdout final-report.local.json
node --import tsx scripts/v3-partnership-games.ts --candidate benchmarks/v3-partnership-training/checkpoint.json --baseline selective32 --seed 9300000 --pairs 300 --output games-v2.local.json
```

Use baseline `benchmarks/v3-first-training/checkpoint.json`, `heuristic`, or `benchmarks/v3-partnership-training/retrained-linear.json` for the other comparisons. Data shards and complete game execution records remain local; published paired evidence is sufficient to recompute win rates, score/trick summaries and pair-bootstrap intervals. Timing and host metadata will vary on another run.

Verification: AI TypeScript checking passed; three Python tests validate ordinary/dropout backprop by finite differences, loss reduction, masking and seeded initialization. All 17 current observation/teacher/partnership tests pass. The broader focused V3 and simulation/rule parity suite passes 55/56; the existing historical checkpoint symlink test fails with Windows EPERM, as in PR #10. Original checkpoint bytes and all final data/gameplay deal boundaries were checked.

Important weaknesses are the teacher's poor heuristic matchup, leading/hidden-trump imitation, and an observable-state representation that omits exact last-trick winner/card and current team trick totals. Those public fields are available to V2 but are not explicitly retained in the 629-vector, which summarizes much of the earlier history. A future, separately versioned schema extension could add them; this experiment makes no silent feature change. Bidding, reveal timing and face-down acceptance remain unlearned.

The most useful next experiment is to first establish a teacher that beats the existing heuristic on paired team outcomes—for example by benchmarking larger V2 budgets and the public exact endgame solver—then distill that verified teacher on nontrivial caller-hidden and partner-winning situations. Increasing model size or imitation volume alone is not supported by these results.
