'use client'

import { OUTCOME_LABELS, TASK_OUTCOMES, normaliseOutcomes, type TaskOutcome } from '@/lib/task-outcomes'

interface Props {
  /** Selected outcomes. DONE is always included. */
  allowed: TaskOutcome[]
  requireReason: boolean
  onChange: (allowed: TaskOutcome[], requireReason: boolean) => void
  /** Show the task-level "override the checklist" switch. */
  canOverride?: boolean
  override?: boolean
  onOverrideChange?: (value: boolean) => void
  /** Label for the inherited state, e.g. "USES THE CHECKLIST'S OPTIONS". */
  inheritedLabel?: string
}

const OPTIONAL_OUTCOMES = TASK_OUTCOMES.filter((o) => o !== 'DONE')

/**
 * The shared admin/manager control for the outcome hierarchy. A checklist uses
 * this directly; a task also gets an override switch so "only DONE" is possible.
 */
export function OutcomeOptions({
  allowed,
  requireReason,
  onChange,
  canOverride = false,
  override = false,
  onOverrideChange,
  inheritedLabel = 'USES THE CHECKLIST / DEFAULT OUTCOME OPTIONS',
}: Props) {
  const selected = normaliseOutcomes(allowed)
  const editing = !canOverride || override

  function toggle(outcome: TaskOutcome) {
    const next = selected.includes(outcome)
      ? selected.filter((o) => o !== outcome)
      : [...selected, outcome]
    onChange(normaliseOutcomes(next), requireReason)
  }

  return (
    <div className="border border-grey-mid p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs uppercase text-grey-light tracking-wider">Outcome options</span>
        {canOverride && onOverrideChange && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => onOverrideChange(e.target.checked)}
              className="w-4 h-4 accent-white"
            />
            <span className="font-mono text-xs uppercase text-white">Custom for this task</span>
          </label>
        )}
      </div>

      {editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="font-mono text-xs uppercase border border-success text-success px-2 py-1">
              {OUTCOME_LABELS.DONE} · always
            </span>
            {OPTIONAL_OUTCOMES.map((outcome) => {
              const on = selected.includes(outcome)
              return (
                <button
                  key={outcome}
                  type="button"
                  onClick={() => toggle(outcome)}
                  className={`font-mono text-xs uppercase border px-2 py-1 transition-colors ${
                    on
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                  }`}
                >
                  {OUTCOME_LABELS[outcome]}
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requireReason}
              onChange={(e) => onChange(selected, e.target.checked)}
              className="w-4 h-4 accent-warning"
            />
            <span className="font-mono text-xs uppercase text-white">
              Require a reason for non-DONE outcomes
            </span>
          </label>
          <p className="font-mono text-xs text-grey-light uppercase">
            PARTIAL KEEPS THE TASK ON THE FLOOR UNTIL IT IS FINISHED. NOT REQUIRED / DID NOT COMPLETE SETTLE THE DAY WITHOUT COUNTING AS DONE.
          </p>
        </>
      ) : (
        <p className="font-mono text-xs uppercase text-grey-light">{inheritedLabel}</p>
      )}
    </div>
  )
}
