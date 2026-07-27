import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';

export type InteractiveChoice = {
  id: string;
  label: string;
  source: string;
};

export type InteractiveQuestion = {
  prompt: string;
  choices: InteractiveChoice[];
  correctChoiceId: string | null;
  correctChoiceIds: string[];
  requiredSelectionCount: number;
  selectionMode: 'none' | 'single' | 'multiple';
  interactiveMarkCount: number;
  isPartialInteraction: boolean;
};

const CHOICE_LABELS = 'ABCDEFGH';
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

function balanceInlineMath(value: string) {
  const unescapedDollarCount = [...value].reduce((count, character, index) => {
    if (character !== '$') return count;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1)
      backslashes += 1;
    return backslashes % 2 === 0 ? count + 1 : count;
  }, 0);

  if (unescapedDollarCount % 2 === 0) return value;
  if (value.trimStart().startsWith('$')) return `${value}$`;
  if (value.trimEnd().endsWith('$')) return `$${value}`;
  return value;
}

function cleanChoiceSource(value: string) {
  return balanceInlineMath(
    value
      .trim()
      .replace(/^\|\s*/, '')
      .replace(/\s*\|$/, '')
      .trim(),
  );
}

function parseChoiceLine(line: string) {
  const value = line.trim().replace(/^[-*]\s+/, '');
  const match = value.match(
    /^\|?\s*(?:\*\*)?([A-H])(?:\*\*)?\s*(?:[.)]|:|\|)\s*(.*?)\s*\|?$/i,
  );
  if (!match || !cleanChoiceSource(match[2])) return null;
  return {
    id: match[1].toUpperCase(),
    label: match[1].toUpperCase(),
    source: cleanChoiceSource(match[2]),
  } satisfies InteractiveChoice;
}

function isChoiceSeparator(line: string) {
  const value = line.trim();
  return (
    !value ||
    /^\|?\s*:?-{2,}/.test(value) ||
    /^:{2,3}(?:indent|center|left|tableoptions)?\s*$/i.test(value) ||
    /^\${1,2}\s*$/.test(value) ||
    /^\\+\s*$/.test(value)
  );
}

function normalizeChoiceIds(value: string) {
  const ids = value
    .toUpperCase()
    .split(/\s*(?:,|\/|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => /^[A-H]$/.test(part));
  return [...new Set(ids)];
}

function answerGroups(markScheme: string) {
  const found: Array<{ index: number; ids: string[] }> = [];
  const patterns = [
    /:answer\[\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*(?:\*\*)?\s*\]/gi,
    /\\answer\s*\{\s*\\textrm\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}\s*\}/gi,
    /\\answer\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}/gi,
    /(?:correct\s+answer|answer)\s*(?:is|:)\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of markScheme.matchAll(pattern)) {
      const ids = normalizeChoiceIds(match[1]);
      if (ids.length) found.push({ index: match.index || 0, ids });
    }
  }

  found.sort((left, right) => left.index - right.index);
  const seen = new Set<string>();
  return found
    .filter(({ index, ids }) => {
      const key = `${index}:${ids.join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ ids }) => ids);
}

function requestedSelectionCount(context: string) {
  const match = context.match(
    /(?:choose|select|find|tick|mark)\s+(?:the\s+)?(one|two|three|four|five|six|seven|eight|[1-8])\b/i,
  );
  if (!match) return null;
  const token = match[1].toLowerCase();
  return NUMBER_WORDS[token] || Number(token) || null;
}

function contextualMarkCount(context: string) {
  const matches = Array.from(context.matchAll(/:marks\[\s*(\d+)\s*\]/gi));
  const last = matches.at(-1);
  return last ? Number(last[1]) : null;
}

function emptyInteractive(prompt: string): InteractiveQuestion {
  return {
    prompt,
    choices: [],
    correctChoiceId: null,
    correctChoiceIds: [],
    requiredSelectionCount: 0,
    selectionMode: 'none',
    interactiveMarkCount: 0,
    isPartialInteraction: false,
  };
}

export function isCorrectSelection(selected: string[], correct: string[]) {
  if (selected.length !== correct.length) return false;
  const expected = new Set(correct.map((id) => id.toUpperCase()));
  return selected.every((id) => expected.has(id.toUpperCase()));
}

export function parseInteractiveQuestion(
  content: string,
  markScheme: string,
  maximumMark: number | null = null,
): InteractiveQuestion {
  const normalizedContent = normalizeQuestionSource(content);
  const normalizedMarkScheme = normalizeQuestionSource(markScheme);
  const lines = normalizedContent.split('\n');
  const blocks: Array<{
    start: number;
    end: number;
    choices: InteractiveChoice[];
    context: string;
  }> = [];

  for (let start = 0; start < lines.length; start += 1) {
    const first = parseChoiceLine(lines[start]);
    if (!first || first.id !== 'A') continue;
    const choices = [first];
    let end = start + 1;
    let expected = 1;
    while (end < lines.length) {
      if (isChoiceSeparator(lines[end])) {
        end += 1;
        continue;
      }
      const choice = parseChoiceLine(lines[end]);
      if (!choice || choice.id !== CHOICE_LABELS[expected]) break;
      choices.push(choice);
      expected += 1;
      end += 1;
    }
    if (choices.length >= 2) {
      blocks.push({
        start,
        end,
        choices,
        context: lines.slice(Math.max(0, start - 6), start).join(' '),
      });
      start = Math.max(start, end - 1);
    }
  }

  // Composite papers commonly contain several independent MCQ blocks. Treating
  // only one of them as the whole question creates incorrect grading, so those
  // remain faithful reveal-and-self-assess questions until a grouped parser can
  // represent every sub-question.
  if (blocks.length !== 1) return emptyInteractive(normalizedContent);

  const block = blocks[0];
  const available = new Set(block.choices.map((choice) => choice.id));
  const groups = answerGroups(normalizedMarkScheme).filter((group) =>
    group.every((id) => available.has(id)),
  );
  const requestedCount = requestedSelectionCount(block.context);
  const multiAnswer = groups.find((group) => group.length > 1);
  const singleAnswers = groups.filter((group) => group.length === 1);

  let correctChoiceIds: string[] = [];
  if (requestedCount && requestedCount > 1) {
    if (multiAnswer?.length === requestedCount) correctChoiceIds = multiAnswer;
  } else if (multiAnswer && singleAnswers.length === 0) {
    correctChoiceIds = multiAnswer;
  } else if (singleAnswers.length === 1 && !multiAnswer) {
    correctChoiceIds = singleAnswers[0];
  }

  // Matching exercises reuse one A-H option bank for several numbered answers.
  // Multiple separate single-letter answers are therefore intentionally not
  // collapsed into a misleading multi-select interaction.
  if (!correctChoiceIds.length) return emptyInteractive(normalizedContent);

  const prompt = [...lines.slice(0, block.start), ...lines.slice(block.end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const selectionMode = correctChoiceIds.length > 1 ? 'multiple' : 'single';
  const interactiveMarkCount =
    contextualMarkCount(block.context) || correctChoiceIds.length;
  const isPartialInteraction =
    Number.isFinite(maximumMark) &&
    Number(maximumMark) > 0 &&
    Number(maximumMark) > interactiveMarkCount;

  return {
    prompt,
    choices: block.choices,
    correctChoiceId: selectionMode === 'single' ? correctChoiceIds[0] : null,
    correctChoiceIds,
    requiredSelectionCount: correctChoiceIds.length,
    selectionMode,
    interactiveMarkCount,
    isPartialInteraction,
  };
}
