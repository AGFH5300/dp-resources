#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const browserPath = 'app/library/library-browser.tsx';
const testPath = 'tests/native-library-clicks.test.ts';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`${label} was not unique`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

let source = await readFile(browserPath, 'utf8');

source = replaceOnce(
  source,
  `      onClick={() => navigate(item, path)}\n      onKeyDown={(e) => {`,
  `      onClick={(event) => {\n        if (event.metaKey || event.ctrlKey) {\n          event.preventDefault();\n          navigate(item, path, true);\n          return;\n        }\n        navigate(item, path);\n      }}\n      onAuxClick={(event) => {\n        if (event.button !== 1) return;\n        event.preventDefault();\n        navigate(item, path, true);\n      }}\n      onKeyDown={(e) => {`,
  'list-row click handler',
);

source = replaceOnce(
  source,
  `              onClick={() => navigate(item, basePath)}\n              onKeyDown={(e) => {`,
  `              onClick={(event) => {\n                if (event.metaKey || event.ctrlKey) {\n                  event.preventDefault();\n                  navigate(item, basePath, true);\n                  return;\n                }\n                navigate(item, basePath);\n              }}\n              onAuxClick={(event) => {\n                if (event.button !== 1) return;\n                event.preventDefault();\n                navigate(item, basePath, true);\n              }}\n              onKeyDown={(e) => {`,
  'grid-card click handler',
);

source = replaceOnce(
  source,
  `          onClick={(e) => e.stopPropagation()}\n          className="size-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"`,
  `          onClick={(e) => e.stopPropagation()}\n          onAuxClick={(e) => e.stopPropagation()}\n          className="size-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"`,
  'row checkbox interaction guard',
);

let guardedButtons = 0;
source = source.replace(
  /(aria-label=\{`More actions for \$\{item\.name\}`\}\n)(\s+)(onClick=\{\(e\) => \{)/g,
  (_match, label, indent, click) => {
    guardedButtons += 1;
    return `${label}${indent}onAuxClick={(e) => e.stopPropagation()}\n${indent}${click}`;
  },
);
if (guardedButtons !== 2) {
  throw new Error(`Expected to guard two More actions buttons, found ${guardedButtons}`);
}

await writeFile(browserPath, source);

await writeFile(
  testPath,
  `import { readFileSync } from 'node:fs';\nimport { describe, expect, it } from 'vitest';\n\nconst browser = readFileSync('app/library/library-browser.tsx', 'utf8');\n\ndescribe('Library pointer navigation', () => {\n  it('opens normal clicks in place and modifier or middle clicks in a new tab', () => {\n    expect(browser.match(/event\\.metaKey \\|\\| event\\.ctrlKey/g)).toHaveLength(2);\n    expect(browser.match(/event\\.button !== 1/g)).toHaveLength(2);\n    expect(browser).toContain('navigate(item, path);');\n    expect(browser).toContain('navigate(item, path, true);');\n    expect(browser).toContain('navigate(item, basePath);');\n    expect(browser).toContain('navigate(item, basePath, true);');\n  });\n\n  it('keeps the DP Resources context menu and three-dot new-tab action', () => {\n    expect(browser.match(/onContextMenu=\\{\\(e\\) => \\{/g).length).toBeGreaterThanOrEqual(2);\n    expect(browser).toContain('Open in new tab');\n    expect(browser).toContain("navigate(item, path, true)");\n  });\n\n  it('does not open a resource when middle-clicking row controls', () => {\n    expect(\n      browser.match(/onAuxClick=\\{\\(e\\) => e\\.stopPropagation\\(\\)\\}/g),\n    ).toHaveLength(3);\n  });\n});\n`,
);
