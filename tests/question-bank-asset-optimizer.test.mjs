import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  minifySvg,
  optimizeAssetBody,
  parseArguments,
} from '../scripts/optimize-question-bank-assets.mjs';

describe('Question Bank asset optimizer', () => {
  it('adopts a materially smaller lossless result for PNG diagrams', async () => {
    const width = 400;
    const height = 240;
    const pixels = Buffer.alloc(width * height * 4, 255);
    const source = await sharp(pixels, {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const result = await optimizeAssetBody({
      body: source,
      contentType: 'image/png',
      minSavingsBytes: 1,
      minSavingsPercent: 1,
    });

    expect(result.status).toBe('optimized');
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);
    expect(['image/png', 'image/webp']).toContain(result.contentType);
    expect(result.optimizedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not replace an asset unless both savings thresholds pass', async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await optimizeAssetBody({
      body: source,
      contentType: 'image/png',
      minSavingsBytes: 100_000,
      minSavingsPercent: 99,
    });

    expect(result.status).toBe('not_smaller');
  });

  it('minifies SVG structure without collapsing visible text spacing', () => {
    const source = `
      <!-- removable -->
      <svg viewBox="0 0 100 20">
        <text x="0" y="15">A  B</text>
        <path d="M 0 0 L 10 10" />
      </svg>
    `;

    const result = minifySvg(source);
    expect(result).not.toContain('removable');
    expect(result).toContain('>A  B</text>');
    expect(result).toContain('<path d="M 0 0 L 10 10"/>');
    expect(result).not.toContain('\n');
  });

  it('requires two explicit confirmations before original deletion', () => {
    expect(() =>
      parseArguments(['--mode', 'cleanup', '--confirm-production']),
    ).toThrow('cleanup also requires --delete-originals');

    expect(
      parseArguments([
        '--mode',
        'cleanup',
        '--confirm-production',
        '--delete-originals',
      ]).mode,
    ).toBe('cleanup');
  });
});
