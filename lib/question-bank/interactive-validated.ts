import { normalizeQuestionSource } from '@/lib/question-bank/content-normalization';
import {
  isCorrectSelection,
  parseInteractiveQuestion as parseBaseInteractiveQuestion,
} from './interactive';
import type {
  InteractiveChoice,
  InteractiveQuestion,
  InteractiveSection,
  InteractiveSegment,
} from './interactive';

export { isCorrectSelection };
export type {
  InteractiveChoice,
  InteractiveQuestion,
  InteractiveSection,
  InteractiveSegment,
};

type ChoiceBlockAudit = {
  available: Set<string>;
  reference: string | null;
};

type AnswerGroupAudit = {
  ids: string[];
  reference: string | null;
  index: number;
};

const CHOICE_LABELS = 'ABCDEFGH';
const AUDIO_CONTEXT_MARKER =
  /^\[\[DP_AUDIO_CONTEXT:(secondary|final):[\s\S]*?:audio\{\]\]\s*/i;

function normalizeChoiceIds(value: string) {
  return [
    ...new Set(
      value
        .toUpperCase()
        .split(/\s*(?:,|\/|&|\band\b)\s*/i)
        .map((part) => part.trim())
        .filter((part) => /^[A-H]$/.test(part)),
    ),
  ];
}

function nearestQuestionReference(value: string) {
  const matches = Array.from(
    value.matchAll(/^\s*(\d+)(?:\s*[-–]\s*(\d+))?\.\s*/gm),
  );
  const match = matches.at(-1);
  if (!match) return null;
  return match[2]
    ? `${Number(match[1])}-${Number(match[2])}`
    : String(Number(match[1]));
}

function referenceBounds(reference: string) {
  const [start, end = start] = reference.split('-').map(Number);
  return { start, end };
}

function referencesOverlap(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const a = referenceBounds(left);
  const b = referenceBounds(right);
  return a.start <= b.end && b.start <= a.end;
}

function parseChoiceId(line: string) {
  const value = line.trim().replace(/^[-*]\s+/, '');
  return (
    value.match(
      /^\|?\s*(?:\*\*)?([A-H])(?:\*\*)?\s*(?:[.)]|:|\|)\s*.+?\s*\|?$/i,
    )?.[1]?.toUpperCase() || null
  );
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

function findChoiceBlocks(content: string): ChoiceBlockAudit[] {
  const lines = content.split('\n');
  const blocks: ChoiceBlockAudit[] = [];
  let contextStart = 0;

  for (let start = 0; start < lines.length; start += 1) {
    if (parseChoiceId(lines[start]) !== 'A') continue;
    const available = new Set<string>(['A']);
    let end = start + 1;
    let expected = 1;

    while (end < lines.length) {
      if (isChoiceSeparator(lines[end])) {
        end += 1;
        continue;
      }
      const choiceId = parseChoiceId(lines[end]);
      if (!choiceId || choiceId !== CHOICE_LABELS[expected]) break;
      available.add(choiceId);
      expected += 1;
      end += 1;
    }

    if (available.size >= 2) {
      const context = lines.slice(contextStart, start).join('\n');
      blocks.push({
        available,
        reference: nearestQuestionReference(context),
      });
      contextStart = end;
      start = Math.max(start, end - 1);
    }
  }

  return blocks;
}

function collectExplicitAnswerGroups(markScheme: string): AnswerGroupAudit[] {
  const patterns = [
    /:answer\[\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*(?:\*\*)?\s*\]/gi,
    /\\answer\s*\{\s*\\textrm\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}\s*\}/gi,
    /\\answer\s*\{\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\s*\}/gi,
    /(?:correct\s+answer|answer)\s*(?:is|:)\s*(?:\*\*)?\s*([A-H](?:\s*(?:,|\/|&|\band\b)\s*[A-H])*)\b/gi,
  ];
  const groups: AnswerGroupAudit[] = [];

  for (const pattern of patterns) {
    for (const match of markScheme.matchAll(pattern)) {
      const ids = normalizeChoiceIds(match[1]);
      if (!ids.length) continue;
      const index = match.index || 0;
      groups.push({
        ids,
        index,
        reference: nearestQuestionReference(markScheme.slice(0, index)),
      });
    }
  }

  groups.sort((left, right) => left.index - right.index);
  const seen = new Set<string>();
  return groups.filter((group) => {
    const key = `${group.index}:${group.ids.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function audioDirectiveSourceIds(source: string) {
  const ids = new Set<string>();
  for (const match of source.matchAll(/:audio\{([^}]*)\}/gi)) {
    const body = match[1];
    const aid = body.match(
      /\baid=(?:"([^"]+)"|'([^']+)'|([^\s}]+))/i,
    );
    const sourceId = aid?.[1] || aid?.[2] || aid?.[3] || body.match(/#([^\s}]+)/)?.[1];
    if (sourceId) ids.add(sourceId.toLowerCase());
  }
  return [...ids];
}

function audioContextMarker(
  mode: 'secondary' | 'final',
  sourceIds: string[],
) {
  return `[[DP_AUDIO_CONTEXT:${mode}:${sourceIds
    .map((sourceId) => encodeURIComponent(sourceId))
    .join(',')}:audio{]]`;
}

function routeAllAudioMarkers(
  interactive: InteractiveQuestion,
  normalizedContent: string,
) {
  const sourceIds = audioDirectiveSourceIds(normalizedContent);
  return {
    ...interactive,
    segments: interactive.segments.map((segment) => {
      if (segment.type !== 'content') return segment;
      const markerMode = segment.source.match(AUDIO_CONTEXT_MARKER)?.[1] as
        | 'secondary'
        | 'final'
        | undefined;
      if (!markerMode) return segment;
      return {
        ...segment,
        source: `${audioContextMarker(markerMode, sourceIds)}${segment.source.replace(
          AUDIO_CONTEXT_MARKER,
          '',
        )}`,
      };
    }),
  } satisfies InteractiveQuestion;
}

function staticInteraction(prompt: string): InteractiveQuestion {
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

function correctedSection(
  section: InteractiveSection,
  block: ChoiceBlockAudit,
  explicitGroups: AnswerGroupAudit[],
) {
  const candidates = explicitGroups.filter(
    (group) =>
      group.ids.length === section.requiredSelectionCount &&
      group.ids.every((id) => block.available.has(id)),
  );

  if (!block.reference || !candidates.length) {
    return { section, invalid: false };
  }

  const referenceMatches = candidates.filter((group) =>
    referencesOverlap(block.reference, group.reference),
  );
  if (referenceMatches.length > 1) return { section, invalid: true };

  if (referenceMatches.length === 1) {
    const correctChoiceIds = referenceMatches[0].ids;
    const selectionMode = correctChoiceIds.length > 1 ? 'multiple' : 'single';
    return {
      invalid: false,
      section: {
        ...section,
        correctChoiceIds,
        correctChoiceId: selectionMode === 'single' ? correctChoiceIds[0] : null,
        requiredSelectionCount: correctChoiceIds.length,
        selectionMode,
      },
    };
  }

  const referencedCandidates = candidates.filter((group) => group.reference);
  const unreferencedCandidates = candidates.filter((group) => !group.reference);
  if (referencedCandidates.length > 0 && unreferencedCandidates.length === 0) {
    return { section, invalid: true };
  }

  return { section, invalid: false };
}

export function parseInteractiveQuestion(
  content: string,
  markScheme: string,
  maximumMark: number | null = null,
): InteractiveQuestion {
  const normalizedContent = normalizeQuestionSource(content);
  const normalizedMarkScheme = normalizeQuestionSource(markScheme);
  const parsed = parseBaseInteractiveQuestion(content, markScheme, maximumMark);
  if (!parsed.sections.length) return parsed;

  const blocks = findChoiceBlocks(normalizedContent);
  const explicitGroups = collectExplicitAnswerGroups(normalizedMarkScheme);
  let invalid = false;
  const sections = parsed.sections.map((section) => {
    const sectionNumber = Number(section.id.match(/choice-section-(\d+)/)?.[1]);
    const block = Number.isFinite(sectionNumber) ? blocks[sectionNumber - 1] : null;
    if (!block) {
      invalid = true;
      return section;
    }
    const corrected = correctedSection(section, block, explicitGroups);
    invalid ||= corrected.invalid;
    return corrected.section;
  });

  if (invalid) return staticInteraction(normalizedContent);

  const first = sections[0];
  return routeAllAudioMarkers(
    {
      ...parsed,
      sections,
      choices: first.choices,
      correctChoiceId: first.correctChoiceId,
      correctChoiceIds: first.correctChoiceIds,
      requiredSelectionCount: first.requiredSelectionCount,
      selectionMode: first.selectionMode,
    },
    normalizedContent,
  );
}
