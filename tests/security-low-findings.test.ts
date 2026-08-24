import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../lib/content-security-policy';

const read = (path: string) => readFileSync(path, 'utf8');

describe('practice share error disclosure hardening', () => {
  it('keeps database failures server-side while preserving safe input validation', () => {
    const route = read('app/api/question-bank/practice-shares/route.ts');
    const createShareCatch = route.split('} catch (error) {').at(-1) || '';

    expect(route).toContain("{ error: 'Practice session ID is invalid.' }");
    expect(createShareCatch).toContain(
      "message: error instanceof Error ? error.message : String(error)",
    );
    expect(createShareCatch).toContain(
      "{ error: 'Unable to create this practice-set code.' }",
    );
    expect(createShareCatch).not.toContain('? error.message');
  });
});

describe('nonce-based content security policy', () => {
  it('allows only nonce-authorized inline scripts while preserving required worker/style behavior', () => {
    const nonce = 'testNonce123+/=';
    const csp = contentSecurityPolicy(nonce);
    const scriptDirective =
      csp.split('; ').find((directive) => directive.startsWith('script-src ')) || '';

    expect(scriptDirective).toContain(`'nonce-${nonce}'`);
    expect(scriptDirective).toContain("'strict-dynamic'");
    expect(scriptDirective).toContain("'wasm-unsafe-eval'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(() => contentSecurityPolicy('bad nonce value')).toThrow(
      'A valid CSP nonce is required.',
    );
  });

  it('passes the same nonce policy to Next.js and the browser response', () => {
    const middleware = read('middleware.ts');
    const nextConfig = read('next.config.mjs');

    expect(middleware).toContain("randomBytes(16).toString('base64')");
    expect(middleware).toContain("requestHeaders.set('x-nonce', nonce)");
    expect(middleware).toContain(
      "requestHeaders.set('Content-Security-Policy', csp)",
    );
    expect(middleware).toContain(
      "response.headers.set('Content-Security-Policy', csp)",
    );
    expect(nextConfig).not.toContain("key: 'Content-Security-Policy'");
  });
});

describe('production container privilege hardening', () => {
  it('runs the final web process as the unprivileged node user', () => {
    const dockerfile = read('Dockerfile');
    const userIndex = dockerfile.lastIndexOf('\nUSER node\n');
    const commandIndex = dockerfile.lastIndexOf('\nCMD [');

    expect(dockerfile).toContain('COPY --chown=node:node --from=builder /app/.next ./.next');
    expect(userIndex).toBeGreaterThan(0);
    expect(commandIndex).toBeGreaterThan(userIndex);
    expect(dockerfile.slice(userIndex)).not.toContain('USER root');
  });
});

describe('GitHub Actions supply-chain hardening', () => {
  it('pins every external workflow action to an immutable full commit SHA', () => {
    const workflowFiles = readdirSync('.github/workflows')
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .sort();

    const mutableReferences: string[] = [];
    for (const workflowFile of workflowFiles) {
      const source = read(`.github/workflows/${workflowFile}`);
      for (const line of source.split('\n')) {
        const match = line.match(/^\s*uses:\s+([^\s#]+)\s*(?:#.*)?$/);
        if (!match) continue;
        const reference = match[1];
        if (reference.startsWith('./')) continue;
        const separator = reference.lastIndexOf('@');
        const revision = separator >= 0 ? reference.slice(separator + 1) : '';
        if (!/^[0-9a-f]{40}$/.test(revision)) {
          mutableReferences.push(`${workflowFile}: ${reference}`);
        }
      }
    }

    expect(mutableReferences).toEqual([]);
  });
});
