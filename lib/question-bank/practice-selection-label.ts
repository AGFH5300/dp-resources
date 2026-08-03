export function practiceSelectionLabel(
  groupName: string,
  conceptName: string,
  isOnlySubtopic: boolean,
) {
  return isOnlySubtopic ? groupName : conceptName;
}

type SingletonSubject = {
  groups: Array<{
    name: string;
    concepts: Array<{ id: string }>;
  }>;
  redirectConcepts: Array<{
    groupName: string;
    concept: { id: string };
  }>;
};

export function singletonPracticeConceptIds(subjects: SingletonSubject[]) {
  const ids = new Set<string>();
  for (const subject of subjects) {
    const singletonGroupNames = new Set<string>();
    for (const group of subject.groups) {
      if (group.concepts.length !== 1) continue;
      singletonGroupNames.add(group.name);
      ids.add(group.concepts[0].id);
    }
    for (const redirect of subject.redirectConcepts) {
      if (singletonGroupNames.has(redirect.groupName)) {
        ids.add(redirect.concept.id);
      }
    }
  }
  return ids;
}
