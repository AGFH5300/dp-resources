export function practiceSelectionLabel(
  groupName: string,
  conceptName: string,
  isOnlySubtopic: boolean,
) {
  return isOnlySubtopic ? groupName : conceptName;
}
