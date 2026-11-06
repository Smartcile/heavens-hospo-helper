export type ImportEntity = 'MENU_ITEM' | 'RECIPE' | 'TASK' | 'GUIDE'

export type ImportRowAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'REVIVE'

export type ImportMatchStatus =
  | 'NEW'
  | 'MATCH'
  | 'AMBIGUOUS'
  | 'DUPLICATE_IN_FILE'
  | 'SIMILAR'

export interface ImportMatch {
  status: ImportMatchStatus
  targetId?: string
  label?: string
  score?: number
  deleted?: boolean
}

export interface ImportIssue {
  code: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  rowId?: string
  field?: string
  message: string
}

export interface ImportRow<T> {
  id: string
  values: T
  include: boolean
  action: ImportRowAction
  match?: ImportMatch
  issues: ImportIssue[]
}

export interface ImportExisting {
  id: string
  name: string
  deletedAt?: Date | string | null
}

export interface ImportParseResult<T> {
  rows: ImportRow<T>[]
  issues: ImportIssue[]
}

export interface ImportSummary {
  created: number
  updated: number
  revived: number
  skipped: number
  warnings: string[]
}
