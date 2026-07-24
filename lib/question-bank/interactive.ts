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
};

const CHOICE_LABELS = 'ABCDEFGH';

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
    /^:{2,3}(?:indent|center|tableoptions)?\s*$/i.test(value) ||
    /^\${1,2}\s*$/.test(value) ||
    /^\\+\s*$/.test(value)
  );
}

function correctChoice(markScheme: string) {
  const candidates = [
    /:answer\[\s*(?:\*\*)?([A-H])(?:\*\*)?(?:\s|\]|$)/i,
    /(?:correct\s+answer|answer)\s*(?:is|:)\s*(?:\*\*)?([A-H])\b/i,
    /^\s*(?:\*\*)?([A-H])(?:\*\*)?(?:\s|[.)\]:-])/i,
  ];
  for (const pattern of candidates) {
    const match = markScheme.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function fallbackChoices(answer: string | null) {
  if (!answer) return [];
  const answerIndex = CHOICE_LABELS.indexOf(answer);
  if (answerIndex < 0) return [];
  const optionCount = Math.max(4, answerIndex + 1);
  return [...CHOICE_LABELS.slice(0, optionCount)].map((id) => ({
    id,
    label: id,
    source: `Option ${id}`,
  }));
}

export function parseInteractiveQuestion(
  content: string,
  markScheme: string,
): InteractiveQuestion {
  const normalizedContent = normalizeQuestionSource(content);
  const normalizedMarkScheme = normalizeQuestionSource(markScheme);
  const lines = normalizedContent.split('\n');
  let best: { start: number; end: number; choices: InteractiveChoice[] } | null =
    null;

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
    if (choices.length >= 2 && (!best || choices.length > best.choices.length))
      best = { start, end, choices };
  }

  const answer = correctChoice(normalizedMarkScheme);
  const fallback = fallbackChoices(answer);
  const incompleteChoiceSet =
    Boolean(answer) &&
    (!best ||
      best.choices.length < fallback.length ||
      !best.choices.some((choice) => choice.id === answer) ||
      best.choices.some((choice) => choice.source.includes('(question:')));

  // Table-based and image-based MCQs do not always serialize as one clean line
  // per choice. Keep their original controlled rendering intact and provide a
  // dependable A–D selector rather than showing a partial or uncheckable quiz.
  if (incompleteChoiceSet)
    return {
      prompt: normalizedContent,
      choices: fallback,
      correctChoiceId: answer,
    };

  if (!best)
    return {
      prompt: normalizedContent,
      choices: [],
      correctChoiceId: null,
    };

  const prompt = [...lines.slice(0, best.start), ...lines.slice(best.end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    prompt,
    choices: best.choices,
    correctChoiceId: best.choices.some((choice) => choice.id === answer)
      ? answer
      : null,
  };
}
