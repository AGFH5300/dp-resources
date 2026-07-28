import { describe, expect, it } from 'vitest';

import { parseInteractiveQuestion } from '@/lib/question-bank/interactive';

describe('Question Bank interactive section context', () => {
  it('does not carry a first block selection count into a nearby second block', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`Select two answers. :marks[2]
- A. First
- B. Second
- C. Third

Which final answer is correct? :marks[1]
- A. Alpha
- B. Beta
- C. Gamma`,
      String.raw`:answer[A, C] :marks[2]
:answer[B] :marks[1]`,
      3,
    );

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]).toMatchObject({
      selectionMode: 'multiple',
      requiredSelectionCount: 2,
      correctChoiceIds: ['A', 'C'],
    });
    expect(parsed.sections[1]).toMatchObject({
      selectionMode: 'single',
      requiredSelectionCount: 1,
      correctChoiceIds: ['B'],
    });
    expect(parsed.segments.map((segment) => segment.type)).toEqual([
      'content',
      'choices',
      'content',
      'choices',
      'content',
    ]);
  });

  it('uses the nearest selection-count instruction before an option bank', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`1. Select two details for your written response. :marks[2]

5. Select one answer. :marks[1]
- A. Alpha
- B. Beta
- C. Gamma`,
      String.raw`1. :answer[first detail]
1. :answer[second detail]
5. :answer[C] :marks[1]`,
      3,
    );

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]).toMatchObject({
      selectionMode: 'single',
      requiredSelectionCount: 1,
      correctChoiceIds: ['C'],
    });
  });

  it('maps letter answers by question reference across an intervening written part', () => {
    const parsed = parseInteractiveQuestion(
      String.raw`1. Which first option is correct? :marks[1]
- A. First A
- B. First B
- C. First C

2. Write the letter displayed in the source. :marks[1]

3. Which final option is correct? :marks[1]
- A. Final A
- B. Final B
- C. Final C`,
      String.raw`1. :answer[A] :marks[1]
2. :answer[B] :marks[1]
3. :answer[C] :marks[1]`,
      3,
    );

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].correctChoiceIds).toEqual(['A']);
    expect(parsed.sections[1].correctChoiceIds).toEqual(['C']);
    expect(parsed.isPartialInteraction).toBe(true);
  });

  it('fails safe when the only compatible answer belongs to another numbered section', () => {
    const content = String.raw`1. Which first option is correct? :marks[1]
- A. First A
- B. First B
- C. First C

2. Which second option is correct? :marks[1]
- A. Second A
- B. Second B
- C. Second C`;
    const parsed = parseInteractiveQuestion(
      content,
      String.raw`2. :answer[B] :marks[1]`,
      2,
    );

    expect(parsed.selectionMode).toBe('none');
    expect(parsed.sections).toEqual([]);
    expect(parsed.prompt).toContain('1. Which first option is correct?');
    expect(parsed.prompt).toContain('- A. First A');
    expect(parsed.prompt).toContain('2. Which second option is correct?');
    expect(parsed.prompt).toContain('- B. Second B');
  });
});
