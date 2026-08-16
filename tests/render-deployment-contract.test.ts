import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('Render production deployment contract', () => {
  it('pins the production Blueprint to main while keeping auto-deploy disabled', () => {
    const blueprint = readFileSync('render.yaml', 'utf8');

    expect(blueprint).toContain('name: dp-resources');
    expect(blueprint).toContain('runtime: docker');
    expect(blueprint).toContain('branch: main');
    expect(blueprint).toContain('dockerfilePath: ./Dockerfile');
    expect(blueprint).toContain('autoDeployTrigger: off');
  });

  it('does not retain the mistakenly added Vercel production workflow', () => {
    expect(
      existsSync('.github/workflows/deploy-production-vercel.yml'),
    ).toBe(false);

    const instructions = readFileSync('AGENTS.md', 'utf8');
    expect(instructions).toContain('Render is the production deployment target');
    expect(instructions).toContain('Do not configure or suggest Vercel');
    expect(instructions).toContain('Production Render Auto-Deploy is intentionally disabled');
    expect(instructions).toContain('Manual Deploy → Deploy latest commit');
  });

  it('keeps exact Render commit verification available without auto-running on every main push', () => {
    const route = readFileSync(
      'app/api/health/pdf-search-storage/route.ts',
      'utf8',
    );
    const verifier = readFileSync(
      '.github/workflows/verify-production-pdf-search-deployment.yml',
      'utf8',
    );

    expect(route).toContain("process.env.RENDER === 'true'");
    expect(route).toContain('process.env.RENDER_GIT_COMMIT');
    expect(route).toContain("pdfSearchStorage: 'dual-object-v1'");
    expect(verifier).toContain('workflow_dispatch:');
    expect(verifier).not.toContain('workflow_run:');
    expect(verifier).toContain('EXPECTED_SHA: ${{ inputs.expected_sha || github.sha }}');
  });
});
