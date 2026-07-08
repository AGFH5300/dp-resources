import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const dockerfile = () => readFileSync('Dockerfile', 'utf8');
const nextConfig = () => readFileSync('next.config.mjs', 'utf8');

describe('Render Dockerfile contract', () => {
  it('keeps the builder public directory available for runner copy', () => {
    const file = dockerfile();

    expect(file).toContain('FROM node:24-bookworm-slim AS deps');
    expect(file).toContain('FROM node:24-bookworm-slim AS builder');
    expect(file).toContain('FROM node:24-bookworm-slim AS runner');
    expect(file).toContain('RUN mkdir -p public && npm run build');
    expect(file).toContain('COPY --from=builder /app/public ./public');
  });

  it('makes public Supabase env vars available during the Next build only', () => {
    const file = dockerfile();
    const builderStage = file.split('FROM node:24-bookworm-slim AS builder')[1]?.split('FROM node:24-bookworm-slim AS runner')[0] ?? '';

    expect(builderStage).toContain('ARG NEXT_PUBLIC_SUPABASE_URL');
    expect(builderStage).toContain('ARG NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(builderStage).toContain('NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL');
    expect(builderStage).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(file).not.toContain('ARG SUPABASE_SERVICE_ROLE_KEY');
    expect(file).not.toContain('ARG GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
    expect(file).not.toContain('ARG GOOGLE_SERVICE_ACCOUNT_EMAIL');
    expect(file).not.toContain('ARG GOOGLE_DRIVE_FOLDER_ID');
  });

  it('preserves the runtime requirements for Render', () => {
    const file = dockerfile();

    expect(file).toContain('libreoffice');
    expect(file).toContain('libreoffice-impress');
    expect(file).toContain('EXPOSE 10000');
    expect(file).toContain('npm run start -- -H 0.0.0.0 -p ${PORT:-10000}');
  });

  it('keeps production installs free of dev-only TypeScript runtime requirements', () => {
    const file = dockerfile();
    const runnerStage = file.split('FROM node:24-bookworm-slim AS runner')[1] ?? '';

    expect(file).toContain('RUN npm ci --omit=dev && npm cache clean --force');
    expect(file).toContain('COPY --from=builder /app/next.config.* ./');
    expect(runnerStage).not.toMatch(/npm\s+(?:install|i|add)\s+[^\n]*typescript/i);
  });
});

describe('Next config runtime contract', () => {
  it('uses a JavaScript config file instead of a TypeScript config file', () => {
    expect(existsSync('next.config.ts')).toBe(false);
    expect(existsSync('next.config.mjs')).toBe(true);
  });

  it('preserves security headers and Google Drive/blob frame policy', () => {
    const file = nextConfig();

    expect(file).toContain('Content-Security-Policy');
    expect(file).toContain("frame-ancestors 'none'");
    expect(file).toContain("frame-src 'self' blob: https://docs.google.com https://drive.google.com");
    expect(file).toContain("{ key: 'X-Frame-Options', value: 'DENY' }");
    expect(file).toContain("{ key: 'X-Content-Type-Options', value: 'nosniff' }");
    expect(file).toContain("{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }");
    expect(file).toContain("{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }");
  });
});
