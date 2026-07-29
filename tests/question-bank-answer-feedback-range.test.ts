import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync(
  'components/question-bank/course-practice-workspace.tsx',
  'utf8',
);
const assetRoute = readFileSync(
  'app/api/question-bank/assets/[assetId]/route.ts',
  'utf8',
);
const r2Client = readFileSync('lib/r2-s3.ts', 'utf8');

describe('Question Bank answer feedback and media seeking', () => {
  it('restores instant single-answer checking and removes redundant instructions', () => {
    expect(workspace).not.toContain('Select one answer, then check it.');
    expect(workspace).not.toContain(
      'Select exactly ${section.requiredSelectionCount} answers. ${selectedChoiceIds.length} selected.',
    );
    expect(workspace).not.toContain("? 'Answer checked'");
    expect(workspace).toContain("section.selectionMode === 'single'");
    expect(workspace).toContain('void checkSection(section.id, selections)');
    expect(workspace).toContain(
      "section.selectionMode === 'multiple' && !answerChecked",
    );
  });

  it('labels selected, incorrect, and missed-correct answers unambiguously', () => {
    expect(workspace).toContain('Your answer · Correct');
    expect(workspace).toContain('Your answer · Incorrect');
    expect(workspace).toContain('Correct answer');
    expect(workspace).toContain('<strong>Your answer:</strong>');
    expect(workspace).toContain(
      "Correct {section.correctChoiceIds.length > 1 ? 'answers' : 'answer'}:",
    );
  });

  it('supports authenticated byte-range responses for seekable audio', () => {
    expect(assetRoute).toContain("request.headers.get('range')");
    expect(assetRoute).toContain("'Accept-Ranges': 'bytes'");
    expect(assetRoute).toContain("'Content-Range': `bytes */${byteSize}`");
    expect(assetRoute).toContain('status: 206');
    expect(assetRoute).toContain('status: 416');
    expect(assetRoute).toContain('stored.status !== 206');
    expect(assetRoute).toContain(
      'upstreamContentRange?.toLowerCase() !== expectedContentRange.toLowerCase()',
    );
    expect(assetRoute).toContain('data.size !== byteSize');
    expect(assetRoute).toContain("{ error: 'Asset range unavailable.' }");
    expect(assetRoute).toContain(
      'data.slice(range.start, range.end + 1, storedAsset.content_type)',
    );
    expect(r2Client).toContain('range?: string');
    expect(r2Client).toContain('range: input.range');
  });
});
