import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NeuralNetwork } from './NeuralNetwork';
import { StateVectorizer } from './StateVectorizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ModelManager {
  private static cachedModel: NeuralNetwork | null = null;
  private static readonly MODEL_PATH = path.resolve(__dirname, '../models/bund_rung_brain.json');

  /**
   * Retrieves the trained model if available, otherwise returns null
   */
  public static getModel(): NeuralNetwork | null {
    if (this.cachedModel) {
      return this.cachedModel;
    }

    try {
      if (fs.existsSync(this.MODEL_PATH)) {
        const raw = fs.readFileSync(this.MODEL_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (data.inputSize !== StateVectorizer.FEATURE_COUNT) {
          console.log(`[AI Brain] Stored model input size (${data.inputSize}) does not match new concept-rich feature count (${StateVectorizer.FEATURE_COUNT}). Initializing upgraded brain.`);
          return null;
        }
        this.cachedModel = NeuralNetwork.fromJSON(data);
        console.log('[AI Brain] Loaded trained Bund Rung Neural Brain from disk.');
        return this.cachedModel;
      }
    } catch (err) {
      console.warn('[AI Brain] Error loading neural model:', err);
    }

    return null;
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
  }
}
