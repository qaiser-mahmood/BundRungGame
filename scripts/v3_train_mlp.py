"""CPU NumPy training; exports strict JSON weights for the TypeScript inference path.

No game logic lives here. Only train/validation rows contribute to fitting or selection.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
os.environ.setdefault('OMP_NUM_THREADS', '2')
import argparse
import hashlib
import json
import platform
import time
from pathlib import Path
import numpy as np

FEATURE_SCHEMA = 'bundrung-v3-player-features/v2'

def canonical_hash(value):
    # Node JSON hashes are verified by the TS reader; raw byte hashes below bind this fit.
    return hashlib.sha256(value).hexdigest()

def load_rows(folder, split):
    manifest = json.loads((folder / 'manifest.json').read_text())
    if manifest['featureSchema'] != FEATURE_SCHEMA:
        raise ValueError('V3_SCHEMA')
    rows = []
    for shard in manifest['shards']:
        if shard['split'] == split:
            data = json.loads((folder / shard['file']).read_text())
            if data['split'] != split or data['deal'] != shard['deal']:
                raise ValueError('V3_SHARD')
            rows.extend(data['rows'])
    x = np.asarray([r['x'] for r in rows], dtype=np.float32)
    mask = np.asarray([r['mask'] for r in rows], dtype=np.float32)
    labels = np.asarray([r['label'] for r in rows], dtype=np.int64)
    visits = np.asarray([r['visits'] for r in rows], dtype=np.float32)
    if x.shape != (len(rows), 629) or mask.shape != (len(rows), 52) or not np.isfinite(x).all() or (np.abs(x) > 2).any() or not np.isin(mask, [0, 1]).all() or (mask.sum(1) == 0).any() or (labels < 0).any() or (labels >= 52).any() or not (mask[np.arange(len(rows)), labels] == 1).all():
        raise ValueError('V3_INPUT')
    if visits.shape != mask.shape or (visits < 0).any() or not np.isfinite(visits).all() or (visits[mask == 0] != 0).any():
        raise ValueError('V3_VISITS')
    return rows, x, mask, labels, visits

def init(sizes, rng):
    params = []
    for a, b in zip(sizes[:-1], sizes[1:]):
        params += [(rng.standard_normal((b, a)) * np.sqrt(2 / a)).astype(np.float32), np.zeros(b, dtype=np.float32)]
    return params

def forward(params, x, mask, dropout=0., rng=None):
    activations = [x]
    for i in range(0, len(params), 2):
        z = activations[-1] @ params[i].T + params[i + 1]
        a = np.maximum(z, 0) if i < len(params) - 2 else z
        if dropout and i < len(params) - 2:
            a = a * (rng.random(a.shape) >= dropout) / (1-dropout)
        activations.append(a)
    logits = np.where(mask > 0, activations[-1], -1e9)
    logits -= logits.max(axis=1, keepdims=True)
    p = np.exp(logits) * mask
    p /= p.sum(axis=1, keepdims=True)
    return p, activations

def loss_grad(params, x, mask, target, dropout=0., rng=None):
    p, activations = forward(params, x, mask, dropout, rng)
    loss = -np.sum(target * np.log(np.maximum(p, 1e-20))) / len(x)
    delta = (p - target) / len(x)
    grads = [None] * len(params)
    for i in reversed(range(0, len(params), 2)):
        grads[i] = delta.T @ activations[i // 2]
        grads[i + 1] = delta.sum(axis=0)
        if i:
            delta = (delta @ params[i]) * (activations[i // 2] > 0) / (1-dropout)
    return float(loss), grads

def evaluate(params, x, mask, labels):
    losses, correct, multi_correct, multi_count = 0., 0, 0, 0
    for start in range(0, len(x), 1024):
        p, _ = forward(params, x[start:start+1024], mask[start:start+1024])
        y = labels[start:start+1024]
        pred = p.argmax(1)
        multi = mask[start:start+1024].sum(1) > 1
        losses -= float(np.log(np.maximum(p[np.arange(len(y)), y], 1e-20)).sum())
        correct += int((pred == y).sum())
        multi_correct += int(((pred == y) & multi).sum())
        multi_count += int(multi.sum())
    return dict(samples=len(x), loss=losses/len(x), agreement=correct/len(x), multiSamples=multi_count, multiAgreement=multi_correct/multi_count if multi_count else None)

def train(args):
    folder, out = Path(args.dataset), Path(args.output)
    out.mkdir(parents=True, exist_ok=False)
    manifest = json.loads((folder/'manifest.json').read_text())
    # Verify ALL shard hashes, observation sizes, duplicate states/deals before fitting.
    import subprocess
    subprocess.run(['node', '--import', 'tsx', 'scripts/v3-verify-dataset.ts', str(folder)], check=True)
    train_rows, x, mask, labels, visits = load_rows(folder, 'train')
    validation_rows, vx, vm, vy, _ = load_rows(folder, 'validation')
    if {r['deal'] for r in train_rows} & {r['deal'] for r in validation_rows}:
        raise ValueError('V3_SPLIT_LEAKAGE')
    rng = np.random.default_rng(args.seed)
    sizes = [629, 256, 128, 52] if args.architecture == 'mlp' else [629, 52]
    params = init(sizes, rng)
    if args.architecture == 'linear':
        params = [np.zeros_like(p) for p in params]
    target = np.eye(52, dtype=np.float32)[labels]
    if args.objective == 'visits':
        total = visits.sum(1, keepdims=True)
        distribution = np.divide(visits, total, out=target.copy(), where=total > 0)
        target = .8 * target + .2 * distribution
    moment = [np.zeros_like(p) for p in params]
    variance = [np.zeros_like(p) for p in params]
    history, best, stale, step, best_epoch = [], float('inf'), 0, 0, 0
    started = time.perf_counter()
    best_params = None
    for epoch in range(1, args.epochs + 1):
        epoch_start = time.perf_counter()
        rate = args.rate * (0.5 ** ((epoch-1)//10))
        order = rng.permutation(len(x))
        for offset in range(0, len(x), args.batch):
            indices = order[offset:offset+args.batch]
            _, grads = loss_grad(params, x[indices], mask[indices], target[indices], args.dropout, rng)
            step += 1
            for i, grad in enumerate(grads):
                # Adam, plus small weight decay on matrices only.
                if i % 2 == 0:
                    grad = grad + args.decay * params[i]
                moment[i] *= .9
                moment[i] += .1 * grad
                variance[i] *= .999
                variance[i] += .001 * grad * grad
                params[i] -= rate * (moment[i]/(1-.9**step)) / (np.sqrt(variance[i]/(1-.999**step)) + 1e-8)
        training = evaluate(params, x, mask, labels)
        validation = evaluate(params, vx, vm, vy)
        entry = dict(epoch=epoch, rate=rate, training=training, validation=validation, seconds=time.perf_counter()-epoch_start)
        history.append(entry)
        print(json.dumps(entry), flush=True)
        if validation['loss'] < best - 1e-5:
            best, best_epoch, stale = validation['loss'], epoch, 0
            best_params = [p.copy() for p in params]
        else:
            stale += 1
        if stale >= args.patience:
            break
    duration = time.perf_counter()-started
    provenance = dict(datasetHash=manifest['datasetHash'], generator=manifest['generator'], generatorHash=manifest['generatorHash'], teacher=manifest['teacher'], sourceCommit=manifest['sourceCommit'], trainingSourceSHA256=canonical_hash(Path(__file__).read_text().replace('\r\n','\n').encode()), splitDeals={s:[q['deal'] for q in manifest['shards'] if q['split']==s] for s in ['train','validation','holdout']}, manifestSHA256=canonical_hash((folder/'manifest.json').read_bytes()), kind='synthetic-engine-supervision', expertRecordsUsed=0)
    common = dict(featureSchema=FEATURE_SCHEMA, inputs=629, outputs=52, config=vars(args), provenance=provenance)
    if args.architecture == 'mlp':
        checkpoint = dict(**common, schema='bundrung-v3-mlp/v1', activation='relu', bestEpoch=best_epoch, layers=[dict(inputs=sizes[i], outputs=sizes[i+1], weights=best_params[2*i].ravel().tolist(), bias=best_params[2*i+1].tolist()) for i in range(len(sizes)-1)])
    else:
        checkpoint = dict(**common, schema='bundrung-v3-teacher-policy/v1', epochs=best_epoch, weights=best_params[0].ravel().tolist(), bias=best_params[1].tolist())
    checkpoint_path = out/'checkpoint.json'
    checkpoint_path.write_text(json.dumps(checkpoint, separators=(',', ':'), allow_nan=False), encoding='utf8')
    # Cross-runtime export check, with validation only. Holdout remains unscored.
    probe_rows = validation_rows[:32]
    probe = dict(rows=[dict(x=r['x'], mask=r['mask']) for r in probe_rows], expected=forward(best_params, vx[:32], vm[:32])[0].astype(float).tolist())
    (out/'parity.json').write_text(json.dumps(probe))
    subprocess.run(['node','--import','tsx','scripts/v3-verify-export.ts',str(checkpoint_path),str(out/'parity.json')],check=True)
    report = dict(architecture=sizes, parameters=sum(p.size for p in best_params), bestEpoch=best_epoch, epochsRun=len(history), trainingSeconds=duration, history=history, training=evaluate(best_params,x,mask,labels), validation=evaluate(best_params,vx,vm,vy), checkpointSHA256=canonical_hash(checkpoint_path.read_bytes()), checkpointBytes=checkpoint_path.stat().st_size, config=vars(args), provenance=provenance, runtime=dict(python=platform.python_version(),numpy=np.__version__,cpu=platform.processor(),threads=os.environ['OPENBLAS_NUM_THREADS']), exportParity=True)
    (out/'training-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ['history','provenance']}),flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dataset', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--architecture', choices=['mlp','linear'], default='mlp')
    p.add_argument('--objective', choices=['hard','visits'], default='hard')
    p.add_argument('--seed', type=int, default=763302)
    p.add_argument('--epochs', type=int, default=40)
    p.add_argument('--batch', type=int, default=256)
    p.add_argument('--patience', type=int, default=6)
    p.add_argument('--rate', type=float, default=.001)
    p.add_argument('--decay', type=float, default=.0001)
    p.add_argument('--dropout', type=float, default=0.)
    args=p.parse_args()
    if args.epochs<1 or args.batch<1 or args.patience<1 or not 0<args.rate<=1 or args.decay<0 or not 0<=args.dropout<1:
        p.error('invalid optimizer configuration')
    train(args)
