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
  if (!Array.isArray(raw)) return []
  return [
    ...new Set(
      raw.filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]
}
