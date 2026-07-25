import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { expandResourceSearchAliases } from '@/lib/search-aliases';

const read = (path: string) => readFileSync(path, 'utf8');

describe('captured HTML normalization', () => {
  it('uses parser-based helpers and decodes exactly one entity layer', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          "import { decodeHtmlEntitiesOnce, htmlToPlainText, removeHtmlComments } from './scripts/question-bank/html-utils.mjs';",
          "const result = {",
          "  once: decodeHtmlEntitiesOnce('&amp;lt;tag&amp;gt;'),",
          "  text: htmlToPlainText('<p>Hello<script>bad()</script><img alt=\"x>y\"></p><p>World</p>', { imagePlaceholder: '[image]', preserveBlockBreaks: true }),",
          "  comments: removeHtmlComments('a<!-- hidden <button id=\"x\"> -->b'),",
          "};",
          'process.stdout.write(JSON.stringify(result));',
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toEqual({
      once: '&lt;tag&gt;',
      text: 'Hello [image]\nWorld',
      comments: 'ab',
    });
  });

  it('removes the regex filtering and chained entity decoding that CodeQL flagged', () => {
    const pestle = read('scripts/question-bank/pestle.mjs');
    const capture = read('scripts/question-bank/capture-pestle.mjs');
    const pptx = read('lib/pptx-audio.ts');

    expect(pestle).toContain("from './html-utils.mjs'");
    expect(pestle).not.toContain('.replace(/<script\\b[\\s\\S]*?<\\/script>/gi');
    expect(pestle).not.toContain("replace(/<[^>]+>/g");
    expect(capture).toContain('removeHtmlComments(html)');
    expect(capture).toContain('htmlToPlainText(value');
    expect(capture).not.toContain('html.replace(/<!--[\\s\\S]*?-->/g');
    expect(capture).not.toContain("replace(/<[^>]+>/g");
    expect(pptx).not.toContain(".replaceAll('&amp;', '&')");
  });
});

describe('remaining CodeQL remediations', () => {
  it('fully escapes summary cells, removes no-op replacement, and limits CI permissions', () => {
    const previewBatch = read('scripts/prepare-pdf-previews-batch.mjs');
    const drive = read('lib/drive.ts');
    const workflow = read('.github/workflows/ci.yml');

    expect(previewBatch).toContain("if (character === '\\\\') output += '\\\\\\\\'");
    expect(previewBatch).toContain("else if (character === '|') output += '\\\\|'");
    expect(drive).not.toContain(".replace(/\\n/g, '\\n')");
    expect(workflow).toContain('permissions:\n  contents: read');
  });
});

describe('resource search aliases', () => {
  it('expands common subject abbreviations and full names in both directions', () => {
    expect(expandResourceSearchAliases('econ paper 1')).toContain(
      'economics paper 1',
    );
    expect(expandResourceSearchAliases('economics paper 1')).toContain(
      'econ paper 1',
    );
    expect(expandResourceSearchAliases('ESS notes')).toContain(
      'environmental systems and societies notes',
    );
    expect(
      expandResourceSearchAliases('environmental systems and societies'),
    ).toContain('ess');
    expect(expandResourceSearchAliases('computer science hl')).toContain('cs hl');
    expect(expandResourceSearchAliases('sports science')).toContain('sehs');
  });

  it('runs alias variants through the existing ranked RPC and deduplicates results', () => {
    const route = read('app/api/search/route.ts');
    expect(route).toContain('expandResourceSearchAliases(needle)');
    expect(route).toContain('searchVariants.map');
    expect(route).toContain("sb.rpc('dp_search_resources'");
    expect(route).toContain('new Map<string, any>()');
    expect(route).toContain('merged.set(row.drive_file_id');
  });
});
