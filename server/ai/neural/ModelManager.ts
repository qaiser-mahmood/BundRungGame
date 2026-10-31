import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { NeuralNetwork } from './NeuralNetwork';
import { FEATURE_COUNT } from './FeatureSchema';

const canonical = fileURLToPath(new URL('../models/bund_rung_brain.json', import.meta.url));
const baselineHash = '66c8afb9366ca64f3b7123c275c1d982ad4dec3bac7939931b0a534b57b2e4c3';
export class ModelManager {
  private static cachedModel: NeuralNetwork | null = null;
  private static lastLoadedMtime = 0;

  public static loadModel(filename: string): NeuralNetwork {
    const raw = fs.readFileSync(filename,'utf8');
    // Only the exact preserved baseline may omit schema metadata.
    const legacy = fs.realpathSync(filename) === fs.realpathSync(canonical) &&
      createHash('sha256').update(raw).digest('hex') === baselineHash;
    const model = NeuralNetwork.fromJSON(JSON.parse(raw),legacy);
    if (model.inputSize !== FEATURE_COUNT || model.outputSize !== 52) throw new Error('Incompatible policy dimensions');
    return model;
  }
  public static getModel(): NeuralNetwork | null {
    try {
      const mtime = fs.statSync(canonical).mtimeMs;
      if (!this.cachedModel || mtime !== this.lastLoadedMtime) {
        this.cachedModel = this.loadModel(canonical);
        this.lastLoadedMtime = mtime;
      }
      return this.cachedModel;
    } catch (error) {
      this.clearCache();
      console.error(JSON.stringify({component:'model',reason:'CHECKPOINT_REJECTED',error:String(error)}));
      return null;
    }
  }
  /** Atomic exclusive publication of an experimental checkpoint; never promotion. */
  public static saveModel(network: NeuralNetwork, outputPath?: string): void {
    if (!outputPath) throw new Error('An explicit experimental checkpoint path is required');
    const destination = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    const realDestination = path.join(fs.realpathSync(path.dirname(destination)),path.basename(destination));
    if (realDestination === fs.realpathSync(canonical)) throw new Error('Canonical checkpoint is read-only');
    NeuralNetwork.fromJSON(network.toJSON());
    if (network.inputSize !== FEATURE_COUNT || network.outputSize !== 52) throw new Error('Incompatible policy dimensions');
    const temporary = path.join(path.dirname(destination),`.checkpoint-${randomUUID()}.tmp`);
    try {
      const fd = fs.openSync(temporary,'wx',0o600);
      try {fs.writeFileSync(fd,JSON.stringify(network.toJSON()));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
      // link is atomic and fails if target already exists (no check/write race).
      fs.linkSync(temporary,destination);
    } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  public static clearCache(): void {this.cachedModel=null;this.lastLoadedMtime=0;}
}
