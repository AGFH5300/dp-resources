import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('Render production deployment contract', () => {
  it('pins the production Blueprint to main and enables Git-backed auto-deploys', () => {
    const blueprint = readFileSync('render.yaml', 'utf8');

    expect(blueprint).toContain('name: dp-resources');
    expect(blueprint).toContain('runtime: docker');
    expect(blueprint).toContain('branch: main');
    expect(blueprint).toContain('dockerfilePath: ./Dockerfile');
    expect(blueprint).toContain('autoDeployTrigger: commit');
  });

  it('does not retain the mistakenly added Vercel production workflow', () => {
    expect(
      existsSync('.github/workflows/deploy-production-vercel.yml'),
    ).toBe(false);

    const instructions = readFileSync('AGENTS.md', 'utf8');
    expect(instructions).toContain('Render is the production deployment target');
    expect(instructions).toContain('Do not configure or suggest Vercel');
  });

  it('exposes the non-secret exact Render commit for deployment verification', () => {
    const route = readFileSync(
      'app/api/health/pdf-search-storage/route.ts',
      'utf8',
    );

    expect(route).toContain("process.env.RENDER === 'true'");
    expect(route).toContain('process.env.RENDER_GIT_COMMIT');
    expect(route).toContain("pdfSearchStorage: 'dual-object-v1'");
  });
});
