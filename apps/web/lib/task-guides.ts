// Competency-link input, shared by the worker task POST/PUT. `requiredTrainingIds`
// is the legacy field name the old worker form posted — it always carried GUIDE
// ids (the picker loaded `/api/worker/guides`), so it is an alias, not a
// TrainingModule reference. Both map to `TaskGuide.isRequiredForCompetency`.

export function resolveCompetencyGuideIds(input: {
  competencyGuideIds?: unknown
  requiredTrainingIds?: unknown
}): string[] | undefined {
  const raw = input.competencyGuideIds !== undefined
    ? input.competencyGuideIds
    : input.requiredTrainingIds
  if (raw === undefined) return undefined
  // Malformed input is "no change", never an accidental wipe of existing links.
  if (!Array.isArray(raw)) return undefined
  return [
    ...new Set(
      raw
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    ),
  ]
}
