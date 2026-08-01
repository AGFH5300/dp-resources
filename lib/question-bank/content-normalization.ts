const ATTRIBUTION_LINE = /revision\s+village.*created\s+with\s+chemix/i;
const STYLE_ATTRIBUTE =
  /\{\s*style\s*=\s*\\?(?:"[^}\n]*"|'[^}\n]*')\s*\}/gi;
const TABLE_OPTIONS_DIRECTIVE = /:::tableoptions\s*\{[^}\n]*\}/gi;
const IMPORTED_TABLE_ATTRIBUTE =
  /\b(?:col|row)\d+\s*=\s*(?:\\?["'][^"'\n]*\\?["']|[^\s,;}\]]+)/gi;
const MAXIMUM_MARK_LINE =
  /^\s*\\*\[\s*(?:maximum\s+marks?|puntaje\s+m[aá]ximo|puntuaci[oó]n\s+m[aá]xima|nota\s+m[aá]xima)\s*:\s*\d+\s*\\*\]\s*\\*\s*$/iu;
const STANDALONE_MATH_DELIMITER = /^\s*\$\s*$/;
const LIST_MATH_OPEN = /^(\s*[-*]\s+)\$\s*$/;
const AUDIO_DIRECTIVE = /:audio\{[^}]*\}/gi;
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '−': '⁻',
  '–': '⁻',
};

function readableExponents(value: string) {
  return value.replace(/\^\(([−–-]?\d+)\)/g, (_match, exponent: string) =>
    [...exponent].map((character) => SUPERSCRIPT[character] || character).join(''),
  );
}

function replaceBracketDirective(
  value: string,
  name: string,
  replacement: (content: string) => string,
) {
  const token = `:${name.toLocaleLowerCase()}[`;
  const lower = value.toLocaleLowerCase();
  let output = '';
  let cursor = 0;

  while (cursor < value.length) {
    const start = lower.indexOf(token, cursor);
    if (start < 0) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, start);
    const opening = start + token.length - 1;
    let depth = 0;
    let closing = -1;

    for (let index = opening; index < value.length; index += 1) {
      if (value[index] === '[') depth += 1;
      else if (value[index] === ']') {
        depth -= 1;
        if (depth === 0) {
          closing = index;
          break;
        }
      }
    }

    if (closing < 0) {
      // Preserve the readable content even when the imported wrapper is broken.
      output += value.slice(opening + 1);
      break;
    }

    output += replacement(value.slice(opening + 1, closing));
    cursor = closing + 1;
  }

  return output;
}

function importedSubscript(content: string) {
  const clean = content.trim().replace(/[{}]/g, '');
  if (!clean) return '';
  return /[A-Za-z]/.test(clean)
    ? `$_{\\mathrm{${clean}}}$`
    : `$_{${clean}}$`;
}

function normalizeImportedContainers(value: string) {
  return value
    .replace(/:::centre\b/gi, ':::center')
    .replace(/:::indent\b/gi, '::indent')
    // These are visual source-format wrappers. Their contents are retained,
    // while the unsupported wrapper tokens are removed before rendering.
    .replace(/:::answer\b/gi, '')
    .replace(/:::box\b/gi, '');
}

function normalizeImportedNotation(value: string) {
  return value
    .replace(
      /\$\s*\\answer\s*\{\s*\\textrm\s*\{([^{}]*)\}\s*\}\s*\$/gi,
      ':answer[$1]',
    )
    .replace(/\$\s*\\answer\s*\{([^{}]*)\}\s*\$/gi, ':answer[$1]')
    .replace(
      /\\answer\s*\{\s*\\textrm\s*\{([^{}]*)\}\s*\}/gi,
      ':answer[$1]',
    )
    .replace(/\\answer\s*\{([^{}]*)\}/gi, ':answer[$1]')
    .replace(
      /\$\s*\\text\s*\{\s*\\textquotedblleft\s*\}\s*\$/gi,
      '“',
    )
    .replace(/\\text\s*\{\s*\\textquotedblleft\s*\}/gi, '“')
    .replace(/\$\s*(\d+)\s*-\s*(\d+)\.\s*\$/g, '$1–$2.')
    .replace(/\$\s*(\d+)\.\s*\$/g, '$1.')
    // Removing imported layout commands such as `$\\hspace{1em}$` leaves an
    // empty inline-math pair (`$ $`). It has no semantic content and creates a
    // blank KaTeX node plus messy copied text, so remove it deliberately.
    .replace(/\$[\t ]+\$/g, ' ')
    .replace(/[^\S\n]{2,}/g, ' ');
}

function normalizeSplitListMath(lines: string[]) {
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index].match(LIST_MATH_OPEN);
    if (!opening) {
      output.push(lines[index]);
      continue;
    }

    const collected: string[] = [];
    let cursor = index + 1;
    let repaired = false;

    while (cursor < lines.length) {
      const candidate = lines[cursor].trim();
      if (!candidate) {
        cursor += 1;
        continue;
      }
      if (/^:{1,3}[a-z]/i.test(candidate) || /^[-*]\s+/.test(candidate)) break;

      const closing = candidate.match(/^(.*)\$\s*$/);
      if (closing) {
        collected.push(closing[1].trim());
        const formula = collected.filter(Boolean).join(' ').trim();
        if (formula) {
          output.push(`${opening[1]}$${formula}$`);
          index = cursor;
          repaired = true;
        }
        break;
      }

      collected.push(candidate);
      cursor += 1;
    }

    if (!repaired) output.push(lines[index]);
  }

  return output;
}

function normalizeStandaloneMath(lines: string[]) {
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!STANDALONE_MATH_DELIMITER.test(lines[index])) {
      output.push(lines[index]);
      continue;
    }

    let firstContent = index + 1;
    while (firstContent < lines.length && !lines[firstContent].trim())
      firstContent += 1;

    // Imported display maths sometimes arrives as a line containing only `$`,
    // followed by a LaTeX command and a second `$` line. Convert that pair to a
    // proper display-math block. A lone `$` beside an answer choice is debris and
    // is deliberately discarded instead of being printed to the user.
    if (
      firstContent >= lines.length ||
      !/^\\[A-Za-z]+/.test(lines[firstContent].trim())
    )
      continue;

    let closing = firstContent + 1;
    while (closing < lines.length) {
      const value = lines[closing].trim();
      if (STANDALONE_MATH_DELIMITER.test(lines[closing])) break;
      if (/^:{1,3}[a-z]/i.test(value) || /^[-*]\s+[A-H][.)]/i.test(value)) {
        closing = -1;
        break;
      }
      closing += 1;
    }

    if (closing <= firstContent || closing >= lines.length) continue;

    output.push('$$', ...lines.slice(index + 1, closing), '$$');
    index = closing;
  }

  return output;
}

export function normalizeQuestionSource(value: string) {
  const lines = String(value || '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\t', ' ')
    .split('\n')
    .filter(
      (line) =>
        !ATTRIBUTION_LINE.test(line) && !MAXIMUM_MARK_LINE.test(line),
    );

  let imported = normalizeStandaloneMath(normalizeSplitListMath(lines)).join('\n');
  imported = replaceBracketDirective(imported, 'box', (content) => `\n${content}\n`);
  imported = replaceBracketDirective(imported, 'sub', importedSubscript);

  return readableExponents(
    normalizeImportedNotation(
      normalizeImportedContainers(imported)
        .replace(TABLE_OPTIONS_DIRECTIVE, '')
        .replace(STYLE_ATTRIBUTE, '')
        .replace(IMPORTED_TABLE_ATTRIBUTE, ' ')
        .replace(/<(https?:\/\/[^>\s]+)>/gi, '$1')
        .replace(/<(mailto:[^>\s]+)>/gi, '$1')
        .replace(/^\s*[-*]\s*$/gm, '')
        .replace(/^\s*]\s*$/gm, '')
        .replace(
          /\\hspace\s*(?:\{\s*[^}]*\}|[\d.]+(?:em|ex|px|pt|cm|mm|in)?)/gi,
          ' ',
        )
        .replace(
          /\bhspace\s*\{?\s*[\d.]+(?:em|ex|px|pt|cm|mm|in)?\}?/gi,
          ' ',
        )
        .replace(/\\+\[([^\]\n]+?)\\+\]/g, '[$1]')
        .replace(/\\+=/g, '=')
        .replace(/[«»≪≫]/g, '')
        .replace(/(^|[^\\])\\(?=\s)/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    ),
  );
}

function readablePreviewMath(value: string) {
  return value
    .replace(
      /\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/gi,
      '$1/$2',
    )
    .replace(/\\sqrt\s*\{([^{}]*)\}/gi, '√($1)')
    .replace(/\\(?:text|textrm|mathrm|mathbf|mathit)\s*\{([^{}]*)\}/gi, '$1')
    .replace(/\\(?:times|cdot)\b/gi, ' × ')
    .replace(/\\pm\b/gi, ' ± ')
    .replace(/\\(?:leq|le)\b/gi, ' ≤ ')
    .replace(/\\(?:geq|ge)\b/gi, ' ≥ ')
    .replace(/\\neq\b/gi, ' ≠ ')
    .replace(/\\[A-Za-z]+\b/g, ' ');
}

export function questionPreview(value: string) {
  return readablePreviewMath(normalizeQuestionSource(value))
    .replace(AUDIO_DIRECTIVE, ' Listening audio. ')
    .replace(/!\[[^\]]*\]\(question:[^)]+\)/gi, ' Diagram. ')
    .replace(/:{1,3}[a-z]+(?:\[[^\]]*\])?/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|?\s*:?-{2,}:?\s*(?=\||$)/g, ' ')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\\hspace/gi, ' ')
    .replace(/[*_$\\{}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
