import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const dockerfile = () => readFileSync('Dockerfile', 'utf8');

describe('Render Dockerfile contract', () => {
  it('keeps the builder public directory available for runner copy', () => {
    const file = dockerfile();

    expect(file).toContain('FROM node:24-bookworm-slim AS deps');
    expect(file).toContain('FROM node:24-bookworm-slim AS builder');
    expect(file).toContain('FROM node:24-bookworm-slim AS runner');
    expect(file).toContain('RUN mkdir -p public && npm run build');
    expect(file).toContain('COPY --from=builder /app/public ./public');
  });

  it('preserves the runtime requirements for Render', () => {
    const file = dockerfile();

    expect(file).toContain('libreoffice');
    expect(file).toContain('libreoffice-impress');
    expect(file).toContain('EXPOSE 10000');
    expect(file).toContain('npm run start -- -H 0.0.0.0 -p ${PORT:-10000}');
  });
});
