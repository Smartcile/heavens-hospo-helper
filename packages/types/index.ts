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
  expiresAt: number
}

export interface WorkerTaskView {
  id: string
  title: string
  description: string | null
  completionType: string
  departmentName: string | null
  sectionName: string | null
  assigneeName: string | null      // nominally assigned to this person (still shared)
  guide: { id: string; title: string } | null
  isCompleted: boolean
  completedByName: string | null   // who ticked it (shared list — done for everyone)
  completion: {
    id: string
    note: string | null
    photoUrl: string | null
    completedAt: Date
  } | null
}
