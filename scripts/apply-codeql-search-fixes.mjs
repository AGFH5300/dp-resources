#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Expected source was not found in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Expected source was not unique in ${path}`);
  await writeFile(path, source.slice(0, first) + after + source.slice(first + before.length));
}

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  "import { deterministicUuid } from './archive.mjs';",
  "import { deterministicUuid } from './archive.mjs';\nimport { decodeHtmlEntitiesOnce, htmlToPlainText } from './html-utils.mjs';",
);

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  `function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&#(\\d+);/g, (_, number) =>
      String.fromCodePoint(Number(number)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}`,
  `function decodeBasicEntities(value) {
  return decodeHtmlEntitiesOnce(value);
}`,
);

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  "  const plain = decodeBasicEntities(value).replace(/<[^>]+>/g, '').trim();",
  "  const plain = htmlToPlainText(value).trim();",
);

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  `  let prepared = String(html || '')
    .replace(/<script\\b[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style\\b[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<img\\b[^>]*>/gi, (tag) => {`,
  `  let prepared = String(html || '').replace(/<img\\b[^>]*>/gi, (tag) => {`,
);

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  "        return token(decodeBasicEntities(mathml.replace(/<[^>]+>/g, ' ')));",
  "        return token(htmlToPlainText(mathml));",
);

await replaceOnce(
  'scripts/question-bank/pestle.mjs',
  "        `<p>${token(`**${decodeBasicEntities(label.replace(/<[^>]+>/g, '')).trim()}**`)}</p>`,",
  "        `<p>${token(`**${htmlToPlainText(label).trim()}**`)}</p>`,",
);

await replaceOnce(
  'scripts/question-bank/capture-pestle.mjs',
  'import { spawn } from "node:child_process";',
  'import { spawn } from "node:child_process";\n\nimport { decodeHtmlEntitiesOnce, htmlToPlainText, removeHtmlComments } from "./html-utils.mjs";',
);

await replaceOnce(
  'scripts/question-bank/capture-pestle.mjs',
  '  const uncommented = html.replace(/<!--[\\s\\S]*?-->/g, "");',
  '  const uncommented = removeHtmlComments(html);',
);

await replaceOnce(
  'scripts/question-bank/capture-pestle.mjs',
  `function decodeEntities(value) {
  return value
    .replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}`,
  `function decodeEntities(value) {
  return decodeHtmlEntitiesOnce(value);
}`,
);

await replaceOnce(
  'scripts/question-bank/capture-pestle.mjs',
  `export function normalizeHtml(value) {
  return decodeEntities(String(value || "")
    .replace(/<script\\b[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style\\b[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<img\\b[^>]*>/gi, " [image] ")
    .replace(/<br\\s*\\/?\\s*>/gi, "\\n")
    .replace(/<\\/(?:p|div|li|tr|h[1-6])>/gi, "\\n")
    .replace(/<[^>]+>/g, " "))
    .normalize("NFKC")
    .replace(/\\r/g, "")
    .replace(/[\\t ]+/g, " ")
    .replace(/ *\\n */g, "\\n")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
}`,
  `export function normalizeHtml(value) {
  return htmlToPlainText(value, {
    imagePlaceholder: "[image]",
    preserveBlockBreaks: true,
  })
    .normalize("NFKC")
    .trim();
}`,
);

await replaceOnce(
  'lib/pptx-audio.ts',
  `function decodeXmlAttribute(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}`,
  `const XML_ATTRIBUTE_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
};

function decodeXmlAttribute(value: string) {
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== '&') {
      output += value[cursor++];
      continue;
    }
    const semicolon = value.indexOf(';', cursor + 1);
    if (semicolon < 0 || semicolon - cursor > 8) {
      output += value[cursor++];
      continue;
    }
    const entity = value.slice(cursor + 1, semicolon).toLowerCase();
    const decoded = XML_ATTRIBUTE_ENTITIES[entity];
    if (decoded === undefined) {
      output += value[cursor++];
      continue;
    }
    output += decoded;
    cursor = semicolon + 1;
  }
  return output;
}`,
);

await replaceOnce(
  'scripts/prepare-pdf-previews-batch.mjs',
  `function escapeTable(value) {
  return String(value).replace(/\\|/g, '\\\\|').replace(/\\r?\\n/g, ' ');
}`,
  `function escapeTable(value) {
  let output = '';
  for (const character of String(value)) {
    if (character === '\\\\') output += '\\\\\\\\';
    else if (character === '|') output += '\\\\|';
    else if (character === '\\r' || character === '\\n') {
      if (!output.endsWith(' ')) output += ' ';
    } else output += character;
  }
  return output;
}`,
);

await replaceOnce(
  'lib/drive.ts',
  `  key = key
    .replace(/\\r\\n/g, '\\n')
    .replace(/\\\\n/g, '\\n')
    .replace(/\\n/g, '\\n')
    .replace(/\\r\\n/g, '\\n')
    .replace(/\\r/g, '\\n')`,
  `  key = key
    .replace(/\\r\\n?/g, '\\n')
    .replace(/\\\\n/g, '\\n')`,
);

await replaceOnce(
  '.github/workflows/ci.yml',
  `on:
  pull_request:
  push:
    branches: [main]

jobs:`,
  `on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:`,
);

await replaceOnce(
  'app/api/search/route.ts',
  "import { normalizeResourceName } from '@/lib/resource-utils';",
  "import { normalizeResourceName } from '@/lib/resource-utils';\nimport { expandResourceSearchAliases } from '@/lib/search-aliases';",
);

await replaceOnce(
  'app/api/search/route.ts',
  `  const { data, error } = await sb.rpc('dp_search_resources', {
    search_query: needle,
    result_limit: 50,
  });
  if (error)
    return Response.json(
      { folders: [], files: [], indexState: 'ready' },
      {
        headers:
          process.env.NODE_ENV === 'development'
            ? {
                'Server-Timing': \`search;dur=\${(performance.now() - start).toFixed(1)}\`,
              }
            : undefined,
      },
    );
  const rows = (data || []).map((r: any) => ({
    ...r,
    drive_url: undefined,
    webViewLink: undefined,
  }));`,
  `  const searchVariants = expandResourceSearchAliases(needle);
  const searches = await Promise.all(
    searchVariants.map((searchQuery) =>
      sb.rpc('dp_search_resources', {
        search_query: searchQuery,
        result_limit: 50,
      }),
    ),
  );
  if (searches.every(({ error }) => error))
    return Response.json(
      { folders: [], files: [], indexState: 'ready' },
      {
        headers:
          process.env.NODE_ENV === 'development'
            ? {
                'Server-Timing': \`search;dur=\${(performance.now() - start).toFixed(1)}\`,
              }
            : undefined,
      },
    );

  const merged = new Map<string, any>();
  searches.forEach(({ data }, variantIndex) => {
    for (const row of data || []) {
      const adjustedRank = Number(row.rank_score || 0) - variantIndex * 5;
      const previous = merged.get(row.drive_file_id);
      if (!previous || adjustedRank > previous.rank_score) {
        merged.set(row.drive_file_id, { ...row, rank_score: adjustedRank });
      }
    }
  });
  const rows = [...merged.values()]
    .sort(
      (left, right) =>
        right.rank_score - left.rank_score ||
        Number(right.is_folder) - Number(left.is_folder) ||
        String(left.name).localeCompare(String(right.name)),
    )
    .slice(0, 50)
    .map((row) => ({
      ...row,
      drive_url: undefined,
      webViewLink: undefined,
    }));`,
);

console.log('Applied CodeQL and resource-search fixes.');
