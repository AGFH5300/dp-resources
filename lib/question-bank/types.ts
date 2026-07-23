export type QuestionProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';

export type QuestionFilters = {
  q: string;
  topicId: string | null;
  subtopicId: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  paperId: string | null;
  section: string | null;
  calculator: boolean | null;
  status: QuestionProgressStatus | null;
  saved: boolean | null;
  revisit: boolean | null;
  page: number;
};

export type QuestionListRow = {
  variant_id: string;
  question_id: string;
  reference: string;
  content_preview: string;
  maximum_mark: number;
  difficulty_value: number | null;
  difficulty_label: 'easy' | 'medium' | 'hard' | null;
  section: string | null;
  calculator_allowed: boolean | null;
  topic_id: string;
  topic_name: string;
  paper_id: string | null;
  paper_reference: string | null;
  subtopic_names: string[];
  progress_status: QuestionProgressStatus;
  to_revisit: boolean;
  is_saved: boolean;
  total_count: number;
};

export type QuestionAsset = {
  id: string;
  sourceFileId: string | null;
  role: 'question' | 'markscheme' | 'examiner_report' | 'content_reference';
  sortOrder: number;
  altText: string;
};
