import * as THREE from 'three';
import { Card, Suit, Rank } from '../../../shared/types';

const SUIT_SYMBOLS: Record<Suit, string> = {
  HEARTS: '♥',
  DIAMONDS: '♦',
  CLUBS: '♣',
  SPADES: '♠',
};

const SUIT_COLORS: Record<Suit, string> = {
  HEARTS: '#dc2626',
  DIAMONDS: '#ea580c',
  CLUBS: '#0f172a',
  SPADES: '#020617',
};

export class CardTextureFactory {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();
  private static backTexture: THREE.CanvasTexture | null = null;

  /**
   * Generates or retrieves a high-res CanvasTexture for a card's front face
   */
  public static getCardFrontTexture(card: Card): THREE.CanvasTexture {
    const key = `${card.suit}_${card.rank}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 716;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const symbol = SUIT_SYMBOLS[card.suit] || '♠';
    const color = SUIT_COLORS[card.suit] || '#020617';

    // 1. Background Card Stock (Ivory / Clean White)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 716);

    // Subtle inner border
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(16, 16, 480, 684);

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(28, 28, 456, 660);

    // 2. Corner Indicators (Top-Left)
    ctx.fillStyle = color;
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.rank, 72, 72);

    ctx.font = '50px Arial, sans-serif';
    ctx.fillText(symbol, 72, 130);

    // 3. Corner Indicators (Bottom-Right Inverted)
    ctx.save();
    ctx.translate(512 - 72, 716 - 72);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.fillText(card.rank, 0, 0);
    ctx.font = '50px Arial, sans-serif';
    ctx.fillText(symbol, 0, 58);
    ctx.restore();

    // 4. Center Graphics
    ctx.fillStyle = color;
    if (['J', 'Q', 'K'].includes(card.rank)) {
      // Royal Court frame
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.strokeRect(120, 160, 272, 396);

      ctx.font = 'bold 160px "Times New Roman", serif';
      ctx.fillText(card.rank, 256, 330);

      ctx.font = '80px Arial, sans-serif';
      ctx.fillText(symbol, 256, 470);
    } else if (card.rank === 'A') {
      // Large Ornate Ace Center
      ctx.font = '220px Arial, sans-serif';
      ctx.fillText(symbol, 256, 358);
    } else {
      // Number Cards Center Symbol
      ctx.font = '160px Arial, sans-serif';
      ctx.fillText(symbol, 256, 358);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Generates or retrieves an ornate casino card back texture
   */
  public static getCardBackTexture(): THREE.CanvasTexture {
    if (this.backTexture) {
      return this.backTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 716;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    // Deep Royal Navy/Gold Card Back
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 716);

    // White outer border
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(16, 16, 480, 684);

    // Crimson/Gold Ornate Pattern Inlay
    const gradient = ctx.createLinearGradient(32, 32, 480, 684);
    gradient.addColorStop(0, '#881337');
    gradient.addColorStop(0.5, '#4c0519');
    gradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = gradient;
    ctx.fillRect(32, 32, 448, 652);

    // Geometric Diamond Grid
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.lineWidth = 4;
    const step = 40;
    for (let x = -716; x < 512 + 716; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 716, 684);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 684);
      ctx.lineTo(x + 716, 32);
      ctx.stroke();
    }

    // Center Golden Medallion
    ctx.beginPath();
    ctx.arc(256, 358, 80, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 36px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BUND', 256, 342);
    ctx.font = 'bold 26px "Times New Roman", serif';
    ctx.fillText('RUNG', 256, 376);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.backTexture = texture;
    return texture;
  }
}
