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

function cleanChoiceSource(value: string) {
  return value
    .trim()
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .trim();
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

export function parseInteractiveQuestion(
  content: string,
  markScheme: string,
): InteractiveQuestion {
  const lines = String(content || '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n');
  let best: { start: number; end: number; choices: InteractiveChoice[] } | null =
    null;

  for (let start = 0; start < lines.length; start += 1) {
    const first = parseChoiceLine(lines[start]);
    if (!first || first.id !== 'A') continue;
    const choices = [first];
    let end = start + 1;
    let expected = 1;
    while (end < lines.length) {
      const trimmed = lines[end].trim();
      if (!trimmed || /^\|?\s*:?-{2,}/.test(trimmed)) {
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

  const answer = correctChoice(String(markScheme || ''));
  if (!best)
    return {
      prompt: String(content || '').trim(),
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
