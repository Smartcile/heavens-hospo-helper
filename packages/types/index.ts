export interface Vertex {
  x: number
  y: number
  cp1x?: number
  cp1y?: number
  cp2x?: number
  cp2y?: number
}

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF'
export type CompletionType = 'TICK' | 'TICK_NOTE' | 'TICK_PHOTO'
export type ScheduleType = 'DAILY' | 'WEEKLY' | 'CUSTOM'

export interface VenueWithDepartments {
  id: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
  departments: DepartmentBasic[]
}

export interface DepartmentBasic {
  id: string
  name: string
  venueId: string
  colour: string | null
  isActive: boolean
}

export interface StaffBasic {
  id: string
  firstName: string
  lastName: string
  role: string
  venueId: string
  departmentId: string | null
  isActive: boolean
  profilePhotoUrl: string | null
}

export interface TaskWithDepartment {
  id: string
  title: string
  description: string | null
  venueId: string
  departmentId: string | null
  assignedToStaffId: string | null
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string | null
  isActive: boolean
  sortOrder: number
  department: DepartmentBasic | null
}

export interface TaskCompletionWithDetails {
  id: string
  taskId: string
  staffId: string
  completedAt: Date
  note: string | null
  photoUrl: string | null
  scheduledDate: Date
  task: { title: string; department: DepartmentBasic | null }
  staff: { firstName: string; lastName: string }
}

export interface DashboardStats {
  totalTasksToday: number
  completedTasksToday: number
  completionPercent: number
  overdueCount: number
  venueStats: VenueStat[]
  recentActivity: RecentActivity[]
  parAlerts: { itemName: string; categoryName: string; currentQty: number; parLevel: number }[]
}

export interface VenueStat {
  venueId: string
  venueName: string
  totalTasks: number
  completedTasks: number
  completionPercent: number
  departmentStats: DepartmentStat[]
}

export interface DepartmentStat {
  departmentId: string
  departmentName: string
  colour: string | null
  totalTasks: number
  completedTasks: number
  completionPercent: number
}

export interface RecentActivity {
  id: string
  staffName: string
  taskTitle: string
  departmentName: string | null
  completedAt: Date
}

export interface WorkerSession {
  staffId: string
  venueId: string
  departmentId: string | null
  firstName: string
  role: Role
  expiresAt: number
}

// ── TIME CLOCK + PAYROLL ──

export interface TimeClockView {
  id: string
  staffId: string
  venueId: string
  clockIn: Date
  clockOut: Date | null
  isActive: boolean
  geoValid: boolean
  note: string | null
  staff: { firstName: string; lastName: string; department: { name: string } | null }
}

export interface TimeClockStatus {
  isClockedIn: boolean
  activeSession: TimeClockView | null
  todayMinutes: number
  recentSessions: TimeClockView[]
}

export interface PayPeriodView {
  id: string
  venueId: string
  startDate: string
  endDate: string
  status: string
  entryCount: number
}

export interface PayrollEntryView {
  id: string
  payPeriodId: string
  staffId: string
  totalHours: number
  hourlyRate: number
  totalPay: number
  note: string | null
  staff: { firstName: string; lastName: string; employmentType: string | null }
}

export interface WorkerTaskView {
  id: string
  title: string
  description: string | null
  completionType: string
  departmentName: string | null
  sectionName: string | null
  assigneeName: string | null
  guide: { id: string; title: string } | null
  isCompleted: boolean
  completedByName: string | null
  completion: {
    id: string
    note: string | null
    photoUrl: string | null
    completedAt: Date
  } | null
  isOneOff: boolean
  dueDate: string | null
  rolloverEnabled: boolean
  rolledOverFrom: string | null
}

// ── FLOOR PLAN SPATIAL ENGINE ──

export interface TableProfileBomItem {
  inventoryItemId: string
  quantity: number
  perChair: boolean
}

/** @deprecated Superseded by `FurnitureView`. Kept while the migration lands. */
export interface TableProfileView {
  id: string
  venueId: string
  name: string
  type: string
  capacity: number
  chairCount: number
  width: number
  depth: number
  shape: string
  colour: string | null
  seatingDensity: number | null
  maxHeadChairs: number
  isActive: boolean
  bomItems: TableProfileBomItem[]
}

/**
 * A piece of furniture as the planner sees it — one InventoryItem row. This is
 * the single source of truth that replaced the TableProfile/InventoryItem pair.
 */
export interface FurnitureView {
  id: string
  venueId: string
  name: string
  /** "TABLE" | "CHAIR" | "BOOTH" | "SOFA" | "BAR" | "OTHER" */
  furnitureType: string
  /** "RECTANGLE" | "CIRCLE" | "POLYGON" */
  shape: string
  width: number
  depth: number
  vertices: { x: number; y: number }[] | null
  colour: string | null
  imageUrl: string | null
  /** Physical pieces owned. */
  totalQty: number
  /** How many are already placed across all layouts. */
  placedCount: number
  defaultChairCount: number
  seatingDensity: number | null
  maxHeadChairs: number
  tableNumbers: string[] | null
  chairItemId: string | null
  categoryId: string
  isActive: boolean
  bomItems: TableProfileBomItem[]
}

/** @deprecated Chairs are positioned around the outline now — see `ChairSlotInput`. */
export type TableEdge = 'top' | 'bottom' | 'left' | 'right'
/** @deprecated */
export type EdgeChairs = Record<TableEdge, number>

/** A seat pinned at position `t` (0..1) around its furniture's outline. */
export interface ChairSlotInput {
  id: string
  t: number
  offset?: number
}

export interface SetupItemInput {
  id: string
  /** @deprecated Use `furnitureItemId`. Still read so old rows keep rendering. */
  tableProfileId?: string | null
  /** The InventoryItem this placement is an instance of. */
  furnitureItemId?: string | null
  x: number
  y: number
  rotation: number
  width: number
  depth: number
  /** "RECTANGLE" | "CIRCLE" | "POLYGON" — copied from the furniture for drawing. */
  shape?: string | null
  vertices?: { x: number; y: number }[] | null
  tableGroupId?: string | null
  sectionId?: string | null
  assignedNumber?: string | null
  label?: string | null
  /** @deprecated Superseded by `chairs`. */
  chairEdges?: EdgeChairs | null
  chairs?: ChairSlotInput[] | null
}

export interface InventoryStockLine {
  itemId: string
  name: string
  available: number
}

export interface InventoryShortage {
  itemId: string
  itemName: string
  required: number
  available: number
  shortage: number
}

export interface ChairPlacement {
  x: number
  y: number
  rotation: number
}

export interface RectangleTable {
  x: number
  y: number
  width: number
  depth: number
  rotation: number
}
