import { ResetAllAnswersDialogBridge } from '@/components/question-bank/reset-all-answers-dialog';

export default function CourseQuestionBankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ResetAllAnswersDialogBridge />
    </>
  );
}
