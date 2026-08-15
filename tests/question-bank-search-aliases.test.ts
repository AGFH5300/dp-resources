import { describe, expect, it } from 'vitest';

import { resolveQuestionSearchAlias } from '../lib/question-bank/search-aliases';

describe('Question Bank Maths search aliases', () => {
  it.each([
    ['aahl', 'analysis-and-approaches-hl'],
    ['AA HL', 'analysis-and-approaches-hl'],
    ['aa/hl/', 'analysis-and-approaches-hl'],
    ['math aahl', 'analysis-and-approaches-hl'],
    ['math aa hl', 'analysis-and-approaches-hl'],
    ['maths AA/HL', 'analysis-and-approaches-hl'],
    ['mathematics aa hl', 'analysis-and-approaches-hl'],
    ['IB Math AA HL', 'analysis-and-approaches-hl'],
    ['AA higher level', 'analysis-and-approaches-hl'],
    ['aasl', 'analysis-and-approaches-sl'],
    ['math aa sl', 'analysis-and-approaches-sl'],
    ['AIHL', 'applications-and-interpretation-hl'],
    ['maths ai hl', 'applications-and-interpretation-hl'],
    ['IB Mathematics AI/HL', 'applications-and-interpretation-hl'],
    ['AI higher level', 'applications-and-interpretation-hl'],
    ['aisl', 'applications-and-interpretation-sl'],
    ['math ai sl', 'applications-and-interpretation-sl'],
    ['AI standard level', 'applications-and-interpretation-sl'],
  ])('resolves %s to the exact course slug', (input, expected) => {
    expect(resolveQuestionSearchAlias(input).query).toBe(expected);
    expect(resolveQuestionSearchAlias(input).label).not.toBeNull();
  });

  it('leaves ordinary searches unchanged', () => {
    expect(resolveQuestionSearchAlias('calculus integration')).toEqual({
      query: 'calculus integration',
      label: null,
    });
  });
});
