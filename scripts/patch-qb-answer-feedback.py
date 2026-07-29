from pathlib import Path
import subprocess

workspace_path = Path('components/question-bank/course-practice-workspace.tsx')
source = workspace_path.read_text()

functions_start = source.index('  function toggleChoice(sectionId: string, choiceId: string) {')
functions_end = source.index('\n  function revealExplanation()', functions_start)
new_functions = '''  function toggleChoice(sectionId: string, choiceId: string) {
    if (!detail || !interactive || checkedSectionIds.includes(sectionId)) return;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const current = selectedChoiceIdsBySection[sectionId] || [];
    let next: string[];
    if (section.selectionMode === 'single') {
      next = [choiceId];
    } else {
      const selected = current.includes(choiceId);
      if (selected) next = current.filter((id) => id !== choiceId);
      else if (current.length < section.requiredSelectionCount)
        next = [...current, choiceId];
      else {
        toast.info(
          `Select exactly ${section.requiredSelectionCount} answers. Deselect one before choosing another.`,
        );
        return;
      }
    }
    const selections = { ...selectedChoiceIdsBySection, [sectionId]: next };
    setSelectedChoiceIdsBySection(selections);
    if (section.selectionMode === 'single') {
      void checkSection(section.id, selections);
      return;
    }
    persistAttempt(selections, checkedSectionIds, false);
  }

  async function checkSection(
    sectionId: string,
    selections = selectedChoiceIdsBySection,
  ) {
    if (!detail || !interactive || checkedSectionIds.includes(sectionId)) return;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const selected = selections[sectionId] || [];
    if (selected.length !== section.requiredSelectionCount) {
      toast.error(
        section.requiredSelectionCount === 1
          ? 'Select one answer before checking.'
          : `Select exactly ${section.requiredSelectionCount} answers before checking.`,
      );
      return;
    }
    const checked = [...checkedSectionIds, sectionId];
    const allChecked = interactive.sections.every((item) => checked.includes(item.id));
    setCheckedSectionIds(checked);
    if (allChecked) setShowExplanation(true);
    persistAttempt(selections, checked, allChecked || showExplanation);

    if (allChecked && !interactive.isPartialInteraction) {
      const previousStatus = detail.progress.status;
      applyQuestionState(detail.variant.id, { status: 'completed' });
      try {
        await updateQuestionState(detail, { status: 'completed' });
      } catch {
        applyQuestionState(detail.variant.id, { status: previousStatus });
        toast.error('Your answers were checked, but progress could not be saved.');
      }
    }
  }
'''
source = source[:functions_start] + new_functions + source[functions_end:]

render_start = source.index('  function renderChoiceSection(sectionId: string) {')
render_end = source.index('\n\n  return (', render_start)
new_render = '''  function renderChoiceSection(sectionId: string) {
    if (!interactive) return null;
    const section = interactive.sections.find((item) => item.id === sectionId);
    if (!section) return null;
    const selectedChoiceIds = selectedChoiceIdsBySection[section.id] || [];
    const answerChecked = checkedSectionIds.includes(section.id);
    const correct =
      answerChecked &&
      isCorrectSelection(selectedChoiceIds, section.correctChoiceIds);

    return (
      <div key={section.id} className="my-5">
        <div
          className="dp-qb-answer-choices"
          role={section.selectionMode === 'multiple' ? 'group' : 'radiogroup'}
          aria-label="Answer choices"
        >
          {section.choices.map((choice) => {
            const isSelected = selectedChoiceIds.includes(choice.id);
            const isCorrect =
              answerChecked && section.correctChoiceIds.includes(choice.id);
            const isIncorrect = answerChecked && isSelected && !isCorrect;
            const answerStateLabel = !answerChecked
              ? null
              : isSelected && isCorrect
                ? 'Your answer · Correct'
                : isIncorrect
                  ? 'Your answer · Incorrect'
                  : isCorrect
                    ? 'Correct answer'
                    : null;
            const maxReached =
              section.selectionMode === 'multiple' &&
              selectedChoiceIds.length >= section.requiredSelectionCount &&
              !isSelected;
            return (
              <button
                key={choice.id}
                type="button"
                role={section.selectionMode === 'multiple' ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                disabled={answerChecked || maxReached}
                onClick={() => toggleChoice(section.id, choice.id)}
                className={`${isSelected ? 'is-selected' : ''} ${
                  isCorrect ? 'is-correct' : ''
                } ${isIncorrect ? 'is-incorrect' : ''}`.trim()}
              >
                <span className="dp-qb-choice-letter">{choice.label}</span>
                <QuestionContent
                  source={choice.source}
                  assets={nonAudioQuestionAssets}
                />
                {answerStateLabel ? (
                  <span
                    className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isIncorrect
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-200'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
                    }`}
                  >
                    {isIncorrect ? (
                      <X className="size-4" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    {answerStateLabel}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {section.selectionMode === 'multiple' && !answerChecked ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void checkSection(section.id)}
            disabled={selectedChoiceIds.length !== section.requiredSelectionCount}
          >
            Check answers
          </button>
        ) : null}
        {answerChecked ? (
          <div
            className={`dp-qb-feedback-banner mt-4 ${
              correct ? 'is-correct' : 'is-incorrect'
            }`}
            aria-live="polite"
          >
            {correct ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <CircleAlert className="size-5" />
            )}
            <div>
              <strong>{correct ? 'Correct — nice work.' : 'Not quite yet.'}</strong>
              {!correct ? (
                <div className="mt-1 space-y-1">
                  <p>
                    <strong>Your answer:</strong>{' '}
                    {answerList(selectedChoiceIds) || 'No answer selected'}.
                  </p>
                  <p>
                    <strong>
                      Correct {section.correctChoiceIds.length > 1 ? 'answers' : 'answer'}:
                    </strong>{' '}
                    {answerList(section.correctChoiceIds)}.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }'''
source = source[:render_start] + new_render + source[render_end:]

for removed in (
    'Select one answer, then check it.',
    'Select exactly ${section.requiredSelectionCount} answers. ${selectedChoiceIds.length} selected.',
    "? 'Answer checked'",
):
    if removed in source:
        raise SystemExit(f'Old UI text remains: {removed}')
for required in (
    'Your answer · Correct',
    'Your answer · Incorrect',
    'Correct answer',
    'void checkSection(section.id, selections)',
):
    if required not in source:
        raise SystemExit(f'Required UI behavior missing: {required}')

workspace_path.write_text(source)

normal_ci = subprocess.check_output(
    ['git', 'show', 'origin/main:.github/workflows/ci.yml'],
    text=True,
)
Path('.github/workflows/ci.yml').write_text(normal_ci)
Path(__file__).unlink()
