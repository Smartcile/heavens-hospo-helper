// Guide importer adapter (PR 3 of #89). Pure — no Prisma imports.
//
// Accepts EITHER a JSON answer (from the prompt) OR a Markdown document, where
// H1 = title, H2 = steps, and paragraphs/lists become sanitised HTML. Imported
// guides are always DRAFT; a guide with no resolved audience gets a loud
// "NOBODY WILL SEE THIS" warning.

import { extractJsonBlock, normaliseMenuName } from '@/lib/menu-import'
import { isGuideType } from '@/lib/guide-types'
import { markdownToHtml, splitGuideMarkdown } from './markdown'
import { findSimilar, normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow } from './types'

export type GuideImportAudienceKind = 'DEPARTMENT' | 'SECTION' | 'POSITION'
export type GuideImportLinkKind = 'ITEM' | 'TASK' | 'CHECKLIST' | 'GUIDE' | 'SECTION' | 'RECIPE'

export interface GuideImportAudience {
  kind: GuideImportAudienceKind
  name: string
}

export interface GuideImportLink {
  kind: GuideImportLinkKind
  name: string
  qty: number | null
  note: string | null
}

export interface GuideImportStep {
  heading: string | null
  contentHtml: string
  videoUrl: string | null
  links: GuideImportLink[]
}

export interface GuideImportValues {
  title: string
  description: string | null
  category: string | null
  guideType: string
  bodyHtml: string
  folderName: string | null
  audiences: GuideImportAudience[]
  isTracked: boolean
  requiresSignOff: boolean
  steps: GuideImportStep[]
  /** Explicit per-row gate: only rewrite GuideStep rows when true. */
  replaceSteps: boolean
}

export interface GuideImportRefs {
  guides: { id: string; name: string }[]
  folders: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  sections: { id: string; name: string }[]
  positions: { id: string; name: string }[]
  items: { id: string; name: string }[]
  tasks: { id: string; name: string }[]
  checklists: { id: string; name: string }[]
  recipes: { id: string; name: string }[]
}

const AUDIENCE_KINDS: GuideImportAudienceKind[] = ['DEPARTMENT', 'SECTION', 'POSITION']
const LINK_KINDS: GuideImportLinkKind[] = ['ITEM', 'TASK', 'CHECKLIST', 'GUIDE', 'SECTION', 'RECIPE']

export function buildGuideImportPrompt({ venueName }: { venueName?: string } = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm importing playbook guides${venue} into a hospitality system.`,
    `Read the attached document (PDF, photo or text) and return STRICT JSON in one fenced \`\`\`json block.`,
    `You may also reply with a Markdown document instead: use one H1 for the title and an H2 per step.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "guides": [`,
    `    {`,
    `      "title": "OPENING THE BAR",`,
    `      "description": "Short summary or null",`,
    `      "category": "FRONT OF HOUSE",`,
    `      "guideType": "SOP",`,
    `      "body": "Intro text or null",`,
    `      "folder": "BARS",`,
    `      "tracked": true,`,
    `      "requiresSignOff": false,`,
    `      "audiences": [{ "kind": "SECTION", "name": "BAR" }],`,
    `      "steps": [`,
    `        {`,
    `          "heading": "UNLOCK",`,
    `          "content": "Unlock the doors.",`,
    `          "videoUrl": null,`,
    `          "links": [{ "kind": "ITEM", "name": "DOOR KEY", "qty": 1, "note": null }]`,
    `        }`,
    `      ]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- guideType is HOW_TO, SOP, FAQ, TRAINING, POLICY or OTHER. Never PRODUCT_REFERENCE.`,
    `- audiences kind is DEPARTMENT, SECTION or POSITION; name must be an existing venue name.`,
    `- links kind is ITEM, TASK, CHECKLIST, GUIDE, SECTION or RECIPE; name must be an existing record.`,
    `- steps content and body are plain text or simple Markdown.`,
    `- title, category, folder and all names UPPERCASE. Never invent names.`,
    `- Do NOT include an onboarding flag; onboarding is modelled separately.`,
  ].join('\n')
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const n = Number(value.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseAudience(raw: unknown, id: string): { audience: GuideImportAudience | null; issue: ImportIssue | null } {
  let kind = ''
  let name = ''
  if (typeof raw === 'string') {
    const [maybeKind, ...rest] = raw.split(':')
    kind = maybeKind.trim().toUpperCase()
    name = rest.join(':').trim()
  } else if (raw && typeof raw === 'object') {
    const source = raw as Record<string, unknown>
    kind = String(source.kind ?? source.targetKind ?? '').trim().toUpperCase()
    name = normaliseMenuName(source.name ?? source.targetName ?? source.target)
  }
  if (!AUDIENCE_KINDS.includes(kind as GuideImportAudienceKind) || !name) {
    return { audience: null, issue: { code: 'AUDIENCE_INVALID', severity: 'WARNING', rowId: id, message: `IGNORED INVALID AUDIENCE "${String(raw)}"` } }
  }
  return { audience: { kind: kind as GuideImportAudienceKind, name }, issue: null }
}

function parseLink(raw: unknown, id: string): { link: GuideImportLink | null; issue: ImportIssue | null } {
  if (!raw || typeof raw !== 'object') {
    return { link: null, issue: { code: 'LINK_INVALID', severity: 'WARNING', rowId: id, message: 'IGNORED A STEP LINK THAT WAS NOT AN OBJECT' } }
  }
  const source = raw as Record<string, unknown>
  const kind = String(source.kind ?? source.target ?? '').trim().toUpperCase()
  const name = normaliseMenuName(source.name ?? source.targetName ?? source.title)
  if (!LINK_KINDS.includes(kind as GuideImportLinkKind) || !name) {
    return { link: null, issue: { code: 'LINK_INVALID', severity: 'WARNING', rowId: id, message: `IGNORED INVALID STEP LINK "${String(raw)}"` } }
  }
  const qty = toNumber(source.qty)
  return {
    link: {
      kind: kind as GuideImportLinkKind,
      name,
      qty: qty != null ? Math.max(1, Math.trunc(qty)) : null,
      note: toStringOrNull(source.note),
    },
    issue: null,
  }
}

function rowsFromJson(list: unknown[]): { rows: ImportRow<GuideImportValues>[]; issues: ImportIssue[] } {
  const rows: ImportRow<GuideImportValues>[] = []
  const issues: ImportIssue[] = []
  const seen = new Map<string, string>()

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const source = entry as Record<string, unknown>
    const title = normaliseMenuName(source.title ?? source.name)
    if (!title) {
      issues.push({ code: 'GUIDE_TITLE_MISSING', severity: 'ERROR', message: `GUIDE #${index + 1} HAS NO TITLE - SKIPPED` })
      return
    }

    const id = `g${index}`
    const rowIssues: ImportIssue[] = []
    const key = normaliseImportKey(title)
    const duplicateOf = seen.get(key)
    if (!duplicateOf) seen.set(key, id)

    const rawType = String(source.guideType ?? source.type ?? 'HOW_TO').trim().toUpperCase()
    let guideType = isGuideType(rawType) ? rawType : 'HOW_TO'
    if (rawType === 'PRODUCT_REFERENCE') {
      guideType = 'PRODUCT_REFERENCE'
      rowIssues.push({ code: 'PRODUCT_REFERENCE_UNSUPPORTED', severity: 'ERROR', rowId: id, message: `"${title}" IS A PRODUCT REFERENCE - IMPORT IT FROM MENU ITEMS INSTEAD` })
    } else if (!isGuideType(rawType)) {
      rowIssues.push({ code: 'GUIDE_TYPE_INVALID', severity: 'WARNING', rowId: id, message: `"${title}" GUIDE TYPE "${rawType}" UNKNOWN - ASSUMED HOW TO` })
    }

    const rawAudiences = Array.isArray(source.audiences) ? source.audiences : []
    const audiences: GuideImportAudience[] = []
    for (const rawAudience of rawAudiences) {
      const parsed = parseAudience(rawAudience, id)
      if (parsed.audience) audiences.push(parsed.audience)
      if (parsed.issue) rowIssues.push(parsed.issue)
    }

    const rawSteps = Array.isArray(source.steps) ? source.steps : []
    const steps: GuideImportStep[] = []
    for (const rawStep of rawSteps) {
      if (!rawStep || typeof rawStep !== 'object') continue
      const step = rawStep as Record<string, unknown>
      const content = toStringOrNull(step.content) ?? ''
      const links: GuideImportLink[] = []
      const rawLinks = Array.isArray(step.links) ? step.links : []
      for (const rawLink of rawLinks) {
        const parsed = parseLink(rawLink, id)
        if (parsed.link) links.push(parsed.link)
        if (parsed.issue) rowIssues.push(parsed.issue)
      }
      const heading = normaliseMenuName(step.heading ?? step.title) || null
      if (!heading && !content) continue
      steps.push({ heading, contentHtml: markdownToHtml(content), videoUrl: toStringOrNull(step.videoUrl), links })
    }

    if (duplicateOf) {
      rowIssues.push({ code: 'DUPLICATE_IN_FILE', severity: 'WARNING', rowId: id, message: `DUPLICATE "${title}" - ONLY THE FIRST IS KEPT` })
    }

    rows.push({
      id,
      values: {
        title,
        description: toStringOrNull(source.description),
        category: normaliseMenuName(source.category) || null,
        guideType,
        bodyHtml: markdownToHtml(toStringOrNull(source.body ?? source.bodyHtml) ?? ''),
        folderName: normaliseMenuName(source.folder ?? source.folderName) || null,
        audiences,
        isTracked: source.tracked === true || source.isTracked === true,
        requiresSignOff: source.requiresSignOff === true || source.signOff === true,
        steps,
        replaceSteps: false,
      },
      include: !duplicateOf,
      action: duplicateOf ? 'SKIP' : 'CREATE',
      match: duplicateOf ? { status: 'DUPLICATE_IN_FILE', label: duplicateOf } : { status: 'NEW' },
      issues: rowIssues,
    })
  })

  return { rows, issues }
}

function rowsFromMarkdown(markdown: string): { rows: ImportRow<GuideImportValues>[]; issues: ImportIssue[] } | { error: string } {
  const doc = splitGuideMarkdown(markdown)
  if (!doc.title) return { error: 'MARKDOWN NEEDS A TITLE (AN H1 LINE)' }
  return {
    rows: [{
      id: 'g0',
      values: {
        title: normaliseMenuName(doc.title),
        description: null,
        category: null,
        guideType: 'HOW_TO',
        bodyHtml: doc.bodyHtml,
        folderName: null,
        audiences: [],
        isTracked: false,
        requiresSignOff: false,
        steps: doc.steps.map((step) => ({ heading: step.heading, contentHtml: step.contentHtml, videoUrl: null, links: [] })),
        replaceSteps: false,
      },
      include: true,
      action: 'CREATE',
      match: { status: 'NEW' },
      issues: [],
    }],
    issues: [],
  }
}

/** Parse a JSON answer, or fall back to a Markdown document (H1/H2). */
export function parseGuideImportAnswer(raw: string): ImportParseResult<GuideImportValues> | { error: string } {
  const json = extractJsonBlock(raw)
  if (!json) return rowsFromMarkdown(raw)

  let root: Record<string, unknown>
  try {
    root = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  const list = Array.isArray(root.guides)
    ? root.guides
    : root.guide && typeof root.guide === 'object'
      ? [root.guide]
      : null
  if (!list) return { error: 'NO GUIDES FOUND IN THE ANSWER' }

  const parsed = rowsFromJson(list)
  if (parsed.rows.length === 0) return { error: 'NO GUIDES FOUND IN THE ANSWER' }
  return parsed
}

export function matchGuideRows(
  rows: ImportRow<GuideImportValues>[],
  existing: ImportExisting[],
): ImportRow<GuideImportValues>[] {
  const byKey = new Map<string, ImportExisting[]>()
  for (const row of existing) {
    const key = normaliseImportKey(row.name)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  return rows.map((row) => {
    if (row.match?.status === 'DUPLICATE_IN_FILE') return row
    const key = normaliseImportKey(row.values.title)
    const exact = byKey.get(key) ?? []
    if (exact.length === 1) {
      const target = exact[0]
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'MATCH', targetId: target.id, label: target.name, deleted: !!target.deletedAt },
      }
    }
    if (exact.length > 1) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'AMBIGUOUS', label: `${exact.length} EXISTING GUIDES` },
        issues: [...row.issues, { code: 'AMBIGUOUS_NAME', severity: 'ERROR', message: `"${row.values.title}" MATCHES ${exact.length} GUIDES - RENAME OR SKIP` }],
      }
    }
    const similar = findSimilar(row.values.title, existing)
    if (similar) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'SIMILAR', targetId: similar.target.id, label: similar.target.name, score: similar.score, deleted: !!similar.target.deletedAt },
      }
    }
    return row
  })
}

function findExact<T extends { name: string }>(name: string, list: T[]): T | 'AMBIGUOUS' | null {
  const key = normaliseImportKey(name)
  const matches = list.filter((row) => normaliseImportKey(row.name) === key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

function audienceList(kind: GuideImportAudienceKind, refs: GuideImportRefs) {
  return kind === 'DEPARTMENT' ? refs.departments : kind === 'SECTION' ? refs.sections : refs.positions
}

function linkList(kind: GuideImportLinkKind, refs: GuideImportRefs) {
  switch (kind) {
    case 'ITEM': return refs.items
    case 'TASK': return refs.tasks
    case 'CHECKLIST': return refs.checklists
    case 'GUIDE': return refs.guides
    case 'SECTION': return refs.sections
    case 'RECIPE': return refs.recipes
  }
}

/** Resolve audiences and step links by name; unknown = row ERROR + SKIP. */
export function resolveGuideImportRefs(
  rows: ImportRow<GuideImportValues>[],
  refs: GuideImportRefs,
): ImportRow<GuideImportValues>[] {
  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues]

    for (const audience of row.values.audiences) {
      const found = findExact(audience.name, audienceList(audience.kind, refs))
      if (!found) {
        issues.push({ code: 'AUDIENCE_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'audiences', message: `${audience.kind} "${audience.name}" NOT FOUND - MAP OR SKIP` })
      } else if (found === 'AMBIGUOUS') {
        issues.push({ code: 'AUDIENCE_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'audiences', message: `${audience.kind} "${audience.name}" MATCHES MULTIPLE - MAP OR SKIP` })
      }
    }

    for (const step of row.values.steps) {
      for (const link of step.links) {
        const found = findExact(link.name, linkList(link.kind, refs))
        if (!found) {
          issues.push({ code: 'LINK_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'links', message: `${link.kind} "${link.name}" NOT FOUND - MAP OR SKIP` })
        } else if (found === 'AMBIGUOUS') {
          issues.push({ code: 'LINK_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'links', message: `${link.kind} "${link.name}" MATCHES MULTIPLE - MAP OR SKIP` })
        }
      }
    }

    if (row.values.folderName && !findExact(row.values.folderName, refs.folders)) {
      issues.push({ code: 'FOLDER_WILL_BE_CREATED', severity: 'INFO', rowId: row.id, field: 'folderName', message: `FOLDER "${row.values.folderName}" WILL BE CREATED` })
    }

    if (row.values.audiences.length === 0) {
      issues.push({ code: 'NO_AUDIENCE', severity: 'WARNING', rowId: row.id, field: 'audiences', message: 'NOBODY WILL SEE THIS - NO AUDIENCE RESOLVED (THE GUIDE IS DRAFT ANYWAY)' })
    }

    if (row.values.guideType === 'PRODUCT_REFERENCE') {
      issues.push({ code: 'PRODUCT_REFERENCE_UNSUPPORTED', severity: 'ERROR', rowId: row.id, field: 'guideType', message: 'PRODUCT REFERENCE GUIDES ARE NOT IMPORTED HERE' })
    }

    if (!issues.some((issue) => issue.severity === 'ERROR')) return { ...row, issues }
    return { ...row, issues, action: 'SKIP', include: false }
  })
}
