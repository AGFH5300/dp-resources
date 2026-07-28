import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';

export type InteractiveChoice = {
  id: string;
  label: string;
  source: string;
};

export type InteractiveSection = {
  id: string;
  choices: InteractiveChoice[];
  correctChoiceId: string | null;
  correctChoiceIds: string[];
  requiredSelectionCount: number;
  selectionMode: 'single' | 'multiple';
  interactiveMarkCount: number;
};

export type InteractiveSegment =
  | { type: 'content'; source: string }
  | { type: 'choices'; sectionId: string };

export type InteractiveQuestion = {
  prompt: string;
  promptBeforeChoices: string;
  promptAfterChoices: string;
  choices: InteractiveChoice[];
  correctChoiceId: string | null;
  correctChoiceIds: string[];
  requiredSelectionCount: number;
  selectionMode: 'none' | 'single' | 'multiple';
  interactiveMarkCount: number;
  isPartialInteraction: boolean;
  sections: InteractiveSection[];
  segments: InteractiveSegment[];
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

type ChoiceBlock = {
  start: number;
  end: number;
  choices: InteractiveChoice[];
  context: string;
};

type AnswerGroup = {
  index: number;
  ids: string[];
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

function answerGroups(markScheme: string): AnswerGroup[] {
  const found: AnswerGroup[] = [];
  const patterns = [
    /:answer\[\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*(?:\*\*)?\s*\]/gi,
    /\\answer\s*\{\s*\\textrm\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}\s*\}/gi,
    /\\answer\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}/gi,
    /(?:correct\s+answer|answer)\s*(?:is|:)\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\b/gi,
    /^\s*(?:\*\*)?\s*([A-H])\s*(?:\*\*)?(?:\s|[.)\]:-]|$)/gim,
  ];

  for (const pattern of patterns) {
    for (const match of markScheme.matchAll(pattern)) {
      const ids = normalizeChoiceIds(match[1]);
      if (ids.length) found.push({ index: match.index || 0, ids });
    }
  }

  found.sort((left, right) => left.index - right.index);
  const seen = new Set<string>();
  return found.filter(({ index, ids }) => {
    const key = `${index}:${ids.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function sourcePart(lines: string[]) {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function emptyInteractive(prompt: string): InteractiveQuestion {
  return {
    prompt,
    promptBeforeChoices: prompt,
    promptAfterChoices: '',
    choices: [],
    correctChoiceId: null,
    correctChoiceIds: [],
    requiredSelectionCount: 0,
    selectionMode: 'none',
    interactiveMarkCount: 0,
    isPartialInteraction: false,
    sections: [],
    segments: prompt ? [{ type: 'content', source: prompt }] : [],
  };
}

export function isCorrectSelection(selected: string[], correct: string[]) {
  if (selected.length !== correct.length) return false;
  const expected = new Set(correct.map((id) => id.toUpperCase()));
  return selected.every((id) => expected.has(id.toUpperCase()));
}

function findChoiceBlocks(lines: string[]) {
  const blocks: ChoiceBlock[] = [];
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
        context: lines.slice(Math.max(0, start - 8), start).join(' '),
      });
      start = Math.max(start, end - 1);
    }
  }
  return blocks;
}

export function parseInteractiveQuestion(
  content: string,
  markScheme: string,
  maximumMark: number | null = null,
): InteractiveQuestion {
  const normalizedContent = normalizeQuestionSource(content);
  const normalizedMarkScheme = normalizeQuestionSource(markScheme);
  const lines = normalizedContent.split('\n');
  const blocks = findChoiceBlocks(lines);
  if (!blocks.length) return emptyInteractive(normalizedContent);

  const groups = answerGroups(normalizedMarkScheme);
  const sectionsByBlock = new Map<number, InteractiveSection>();
  let groupCursor = 0;

  for (const [blockIndex, block] of blocks.entries()) {
    const available = new Set(block.choices.map((choice) => choice.id));
    const requestedCount = requestedSelectionCount(block.context);
    const compatible = groups
      .map((group, index) => ({ ...group, groupIndex: index }))
      .filter(
        (group) =>
          group.groupIndex >= groupCursor &&
          group.ids.every((id) => available.has(id)),
      );

    let selectedGroup = requestedCount
      ? compatible.find((group) => group.ids.length === requestedCount)
      : compatible.find((group) => group.ids.length === 1);

    if (!selectedGroup && blocks.length === 1 && !requestedCount) {
      const multiGroups = compatible.filter((group) => group.ids.length > 1);
      const singleGroups = compatible.filter((group) => group.ids.length === 1);
      if (multiGroups.length === 1 && singleGroups.length === 0)
        selectedGroup = multiGroups[0];
    }

    // A single option bank followed by several independent single-letter answers
    // is a matching exercise, not one radio question. Keep it non-interactive.
    if (
      blocks.length === 1 &&
      !requestedCount &&
      compatible.filter((group) => group.ids.length === 1).length > 1
    )
      continue;

    if (!selectedGroup) continue;
    groupCursor = selectedGroup.groupIndex + 1;
    const correctChoiceIds = selectedGroup.ids;
    const selectionMode = correctChoiceIds.length > 1 ? 'multiple' : 'single';
    sectionsByBlock.set(blockIndex, {
      id: `choice-section-${blockIndex + 1}`,
      choices: block.choices,
      correctChoiceId: selectionMode === 'single' ? correctChoiceIds[0] : null,
      correctChoiceIds,
      requiredSelectionCount: correctChoiceIds.length,
      selectionMode,
      interactiveMarkCount:
        contextualMarkCount(block.context) || correctChoiceIds.length,
    });
  }

  const sections = [...sectionsByBlock.values()];
  if (!sections.length) return emptyInteractive(normalizedContent);

  const segments: InteractiveSegment[] = [];
  let cursor = 0;
  for (const [blockIndex, block] of blocks.entries()) {
    const before = sourcePart(lines.slice(cursor, block.start));
    if (before) segments.push({ type: 'content', source: before });
    const section = sectionsByBlock.get(blockIndex);
    if (section) segments.push({ type: 'choices', sectionId: section.id });
    else {
      const originalChoices = sourcePart(lines.slice(block.start, block.end));
      if (originalChoices) segments.push({ type: 'content', source: originalChoices });
    }
    cursor = block.end;
  }
  const after = sourcePart(lines.slice(cursor));
  if (after) segments.push({ type: 'content', source: after });

  const contentSegments = segments.filter(
    (segment): segment is Extract<InteractiveSegment, { type: 'content' }> =>
      segment.type === 'content',
  );
  const firstSectionSegment = segments.findIndex((segment) => segment.type === 'choices');
  const promptBeforeChoices = contentSegments[0]?.source || '';
  const promptAfterChoices = segments
    .slice(firstSectionSegment + 1)
    .filter(
      (segment): segment is Extract<InteractiveSegment, { type: 'content' }> =>
        segment.type === 'content',
    )
    .map((segment) => segment.source)
    .join('\n\n');
  const prompt = contentSegments.map((segment) => segment.source).join('\n\n');
  const first = sections[0];
  const interactiveMarkCount = sections.reduce(
    (total, section) => total + section.interactiveMarkCount,
    0,
  );
  const isPartialInteraction =
    Number.isFinite(maximumMark) &&
    Number(maximumMark) > 0 &&
    Number(maximumMark) > interactiveMarkCount;

  return {
    prompt,
    promptBeforeChoices,
    promptAfterChoices,
    choices: first.choices,
    correctChoiceId: first.correctChoiceId,
    correctChoiceIds: first.correctChoiceIds,
    requiredSelectionCount: first.requiredSelectionCount,
    selectionMode: first.selectionMode,
    interactiveMarkCount,
    isPartialInteraction,
    sections,
    segments,
  };
}
