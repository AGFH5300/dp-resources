# Question Bank audio and answer-selection fix

This branch hardens recently imported listening and language questions before production deployment.

## Behaviour covered

- Imported `:audio{...}` directives resolve to the authorised private audio asset at the directive position.
- Source UUIDs and `aid` metadata are never rendered in question cards or question content.
- Audio duration and transcript remain available through the controlled renderer.
- Single-answer and exact-count multi-answer questions use explicit check buttons.
- Multi-answer grading is order-independent and requires exactly the requested number of choices.
- Matching exercises and composite questions are not guessed or falsely graded.
- Questions containing an interactive section plus additional written parts do not auto-complete the whole question; the learner self-assesses after reviewing the full markscheme.
- Legacy locally saved single-answer attempts migrate to the multi-answer storage shape.

## Production checks

Run the normal project gates before merge:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Smoke-test at least one English B, French B, and Spanish B listening question, including a three-answer or four-answer question and a composite/matching question.
