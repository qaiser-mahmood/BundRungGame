import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NeuralNetwork } from './NeuralNetwork';
import { StateVectorizer } from './StateVectorizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ModelManager {
  private static cachedModel: NeuralNetwork | null = null;
  private static lastLoadedMtime: number = 0;
  private static readonly MODEL_PATH = path.resolve(__dirname, '../models/bund_rung_brain.json');

  /**
   * Retrieves the trained model. Automatically hot-reloads if the model file on disk was updated by training.
   */
  public static getModel(): NeuralNetwork | null {
    try {
      if (fs.existsSync(this.MODEL_PATH)) {
        const stat = fs.statSync(this.MODEL_PATH);
        // If cached and disk file has not changed, return cached model immediately
        if (this.cachedModel && stat.mtimeMs === this.lastLoadedMtime) {
          return this.cachedModel;
        }

        // Disk model is new or was updated by external training process
        const raw = fs.readFileSync(this.MODEL_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (data.inputSize !== StateVectorizer.FEATURE_COUNT) {
          console.log(`[AI Brain] Stored model input size (${data.inputSize}) does not match new concept-rich feature count (${StateVectorizer.FEATURE_COUNT}). Initializing upgraded brain.`);
          return null;
        }
        const isReload = this.cachedModel !== null;
        this.cachedModel = NeuralNetwork.fromJSON(data);
        this.lastLoadedMtime = stat.mtimeMs;
        if (isReload) {
          console.log('🔄 [AI Brain] Hot-Reload: Detected newly trained brain on disk! Upgraded live server weights seamlessly.');
        } else {
          console.log('[AI Brain] Loaded trained Bund Rung Neural Brain from disk.');
        }
        return this.cachedModel;
      }
    } catch (err) {
      console.warn('[AI Brain] Error loading/reloading neural model:', err);
      if (this.cachedModel) return this.cachedModel;
    }

    return this.cachedModel;
  }

  /**
   * Saves a trained network to disk
   */
  public static saveModel(network: NeuralNetwork): void {
    try {
      const dir = path.dirname(this.MODEL_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const json = JSON.stringify(network.toJSON());
      fs.writeFileSync(this.MODEL_PATH, json, 'utf-8');
      const stat = fs.statSync(this.MODEL_PATH);
      this.lastLoadedMtime = stat.mtimeMs;
      this.cachedModel = network;
      console.log(`[AI Brain] Saved trained model to ${this.MODEL_PATH} (${(json.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error('[AI Brain] Failed to save neural model:', err);
    }
  }

  /**
   * Clears in-memory cached model
   */
  public static clearCache(): void {
    this.cachedModel = null;
    this.lastLoadedMtime = 0;
  }
}
