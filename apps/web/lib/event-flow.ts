// Pure, Prisma-free builder for the per-event flow view. Auto-derived from the
// data already on the event — no authored graph: block AREAS become the planning
// column, their linked playbook tasks/checklists become prep, and the run-sheet
// (TIMELINE) rows become the event-day moments.

import { blockDef, summariseBlock, type BlockLibrary } from '@/lib/beo-blocks'
import { linkIdsFor } from '@/lib/beo-links'

export const FLOW_STAGES = [
  { key: 'PLANNING', label: 'PLANNING' },
  { key: 'PREP', label: 'PREP' },
  { key: 'EVENT_DAY', label: 'EVENT DAY' },
] as const

export type EventFlowStage = (typeof FLOW_STAGES)[number]['key']

export type EventFlowKind = 'AREA' | 'TASK' | 'CHECKLIST' | 'MOMENT'

export interface EventFlowNode {
  id: string
  stage: EventFlowStage
  kind: EventFlowKind
  label: string
  detail: string
  /** Areas: false when the config has no content yet. Prep/moments: always true. */
  filled: boolean
}

export interface EventFlowStageColumn {
  key: EventFlowStage
  label: string
  nodes: EventFlowNode[]
}

export interface EventFlow {
  stages: EventFlowStageColumn[]
  areasFilled: number
  areasTotal: number
}

export interface EventFlowBlock {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
}

export interface EventFlowInput {
  blocks: EventFlowBlock[]
  library: BlockLibrary
  /** targetId → display name for linked tasks/checklists (optional). */
  names?: Record<string, string>
}

/** True when a block config carries no user-entered content. */
export function configIsEmpty(config: Record<string, unknown> | null | undefined): boolean {
  for (const value of Object.values(config ?? {})) {
    if (typeof value === 'string' && value.trim()) return false
    if (typeof value === 'number' && value !== 0) return false
    if (Array.isArray(value) && value.length > 0) return false
  }
  return true
}

/**
 * Build the flow columns for one event. Duplicate prep nodes (the same task
 * linked from two areas) collapse to one.
 */
export function buildEventFlow(input: EventFlowInput): EventFlow {
  const planning: EventFlowNode[] = []
  const prep: EventFlowNode[] = []
  const eventDay: EventFlowNode[] = []
  const seenPrep = new Set<string>()

  for (const block of input.blocks ?? []) {
    const def = blockDef(block.type, input.library)
    const label = block.title?.trim() || def?.label || block.type

    if (!def?.readOnly && block.type !== 'HISTORY') {
      planning.push({
        id: block.id,
        stage: 'PLANNING',
        kind: 'AREA',
        label,
        detail: summariseBlock({ type: block.type, config: block.config ?? {} }, input.library),
        filled: !configIsEmpty(block.config),
      })
    }

    if (block.type === 'TIMELINE' && Array.isArray(block.config?.rows)) {
      ;(block.config.rows as Record<string, unknown>[]).forEach((row, i) => {
        const what = String(row.label ?? row.detail ?? '').trim()
        const time = String(row.time ?? '').trim()
        eventDay.push({
          id: `${block.id}-row-${i}`,
          stage: 'EVENT_DAY',
          kind: 'MOMENT',
          label: what || time || `MOMENT ${i + 1}`,
          detail: time,
          filled: true,
        })
      })
    }

    for (const id of linkIdsFor(def, 'TASK')) {
      if (seenPrep.has(`task-${id}`)) continue
      seenPrep.add(`task-${id}`)
      prep.push({ id: `task-${id}`, stage: 'PREP', kind: 'TASK', label: input.names?.[id] ?? 'TASK', detail: '', filled: true })
    }
    for (const id of linkIdsFor(def, 'CHECKLIST')) {
      if (seenPrep.has(`checklist-${id}`)) continue
      seenPrep.add(`checklist-${id}`)
      prep.push({ id: `checklist-${id}`, stage: 'PREP', kind: 'CHECKLIST', label: input.names?.[id] ?? 'CHECKLIST', detail: '', filled: true })
    }
  }

  const columns: Record<EventFlowStage, EventFlowNode[]> = {
    PLANNING: planning,
    PREP: prep,
    EVENT_DAY: eventDay,
  }

  return {
    stages: FLOW_STAGES.map((s) => ({ key: s.key, label: s.label, nodes: columns[s.key] })),
    areasFilled: planning.filter((n) => n.filled).length,
    areasTotal: planning.length,
  }
}
