const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export interface DayWeight {
  mon: number
  tue: number
  wed: number
  thu: number
  fri: number
  sat: number
  sun: number
}

export interface CategoryInput {
  id: string
  name: string
  percentage: number
}

export interface DayInput {
  id: string
  date: Date
  dayOfWeek: number // 0=Sun
  isWorkingDay: boolean
}

export interface CategoryDayAllocation {
  categoryId: string
  categoryName: string
  amount: number
}

export interface DailyBudgetAllocation {
  dayId: string
  date: Date
  dayOfWeek: number
  dayName: string
  isWorkingDay: boolean
  allocations: CategoryDayAllocation[]
  dayTotal: number
}

export interface BudgetMathMetadata {
  targetTotal: number
  allocatedTotal: number
  variance: number
}

export interface BudgetMathResult {
  allocations: DailyBudgetAllocation[]
  metadata: BudgetMathMetadata
}

export interface BreakdownInput {
  id: string
  name: string
  departmentId?: string | null
  departmentName?: string | null
  percentage: number // % of daily REVENUE
}

export interface BreakdownAllocation {
  categoryId: string
  categoryName: string
  departmentId: string | null
  departmentName: string | null
  amount: number
}

export interface DailyBudgetWithBreakdowns {
  dayId: string
  date: Date
  dayOfWeek: number
  dayName: string
  isWorkingDay: boolean
  revenue: number
  breakdowns: BreakdownAllocation[]
}

export interface BudgetMathResultWithBreakdowns {
  allocations: DailyBudgetWithBreakdowns[]
  metadata: BudgetMathMetadata
}

export function computeBreakdowns(
  result: BudgetMathResult,
  breakdownCategories: BreakdownInput[]
): BudgetMathResultWithBreakdowns {
  const allocations: DailyBudgetWithBreakdowns[] = result.allocations.map((day) => {
    const revenue = day.dayTotal
    const breakdowns: BreakdownAllocation[] = []

    if (day.isWorkingDay && revenue > 0) {
      for (const cat of breakdownCategories) {
        if (cat.percentage <= 0) continue
        const raw = revenue * (cat.percentage / 100)
        const amount = Math.round(raw / ROUND_TO) * ROUND_TO
        breakdowns.push({
          categoryId: cat.id,
          categoryName: cat.name,
          departmentId: cat.departmentId ?? null,
          departmentName: cat.departmentName ?? null,
          amount,
        })
      }
    }

    return {
      dayId: day.dayId,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayName: day.dayName,
      isWorkingDay: day.isWorkingDay,
      revenue,
      breakdowns,
    }
  })

  return { allocations, metadata: result.metadata }
}

const ROUND_TO = 500

function roundNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest
}

export function generateDailyBudgets(
  totalBudget: number,
  categories: CategoryInput[],
  dailyWeights: DayWeight,
  days: DayInput[]
): BudgetMathResult {
  const allocations: DailyBudgetAllocation[] = []

  let totalAllocated = 0

  for (const day of days) {
    const dayResult: DailyBudgetAllocation = {
      dayId: day.id,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayName: DAY_NAMES[day.dayOfWeek].toUpperCase(),
      isWorkingDay: day.isWorkingDay,
      allocations: [],
      dayTotal: 0,
    }

    if (!day.isWorkingDay) {
      allocations.push(dayResult)
      continue
    }

    const weightKey = DAY_NAMES[day.dayOfWeek]
    const dayWeight = dailyWeights[weightKey]

    let dayTotal = 0

    for (const cat of categories) {
      if (cat.percentage <= 0) continue
      const catMonthly = totalBudget * (cat.percentage / 100)
      const raw = catMonthly * (dayWeight / 100)
      const rounded = roundNearest(raw, ROUND_TO)

      dayResult.allocations.push({
        categoryId: cat.id,
        categoryName: cat.name,
        amount: rounded,
      })
      dayTotal += rounded
    }

    dayResult.dayTotal = dayTotal
    totalAllocated += dayTotal

    allocations.push(dayResult)
  }

  return {
    allocations,
    metadata: {
      targetTotal: totalBudget,
      allocatedTotal: Math.round(totalAllocated * 100) / 100,
      variance: Math.round((totalAllocated - totalBudget) * 100) / 100,
    },
  }
}

export function generateDailyBudgetsNormalized(
  totalBudget: number,
  categories: CategoryInput[],
  dailyWeights: DayWeight,
  days: DayInput[],
  existingAllocations?: Map<string, number>
): BudgetMathResult {
  const allocations: DailyBudgetAllocation[] = []

  const workingDays = days.filter((d) => d.isWorkingDay)

  let totalWeight = 0
  for (const day of workingDays) {
    const weightKey = DAY_NAMES[day.dayOfWeek]
    totalWeight += dailyWeights[weightKey]
  }

  if (totalWeight === 0 || workingDays.length === 0) {
    const emptyAllocations = days.map((day) => ({
      dayId: day.id,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayName: DAY_NAMES[day.dayOfWeek].toUpperCase(),
      isWorkingDay: day.isWorkingDay,
      allocations: [] as CategoryDayAllocation[],
      dayTotal: 0,
    }))
    return {
      allocations: emptyAllocations,
      metadata: { targetTotal: totalBudget, allocatedTotal: 0, variance: -totalBudget },
    }
  }

  let totalAllocated = 0

  for (const day of days) {
    const dayResult: DailyBudgetAllocation = {
      dayId: day.id,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayName: DAY_NAMES[day.dayOfWeek].toUpperCase(),
      isWorkingDay: day.isWorkingDay,
      allocations: [],
      dayTotal: 0,
    }

    if (!day.isWorkingDay) {
      allocations.push(dayResult)
      continue
    }

    const existingAmount = existingAllocations?.get(day.id)

    const weightKey = DAY_NAMES[day.dayOfWeek]
    const dayWeight = dailyWeights[weightKey]
    const normalizedWeight = dayWeight / totalWeight

    let dayTotal = 0

    for (const cat of categories) {
      if (cat.percentage <= 0) continue
      const catMonthly = totalBudget * (cat.percentage / 100)
      const raw = catMonthly * normalizedWeight
      let rounded = roundNearest(raw, ROUND_TO)

      if (existingAmount !== undefined && existingAmount !== rounded && categories.length === 1) {
        rounded = existingAmount
      }

      dayResult.allocations.push({
        categoryId: cat.id,
        categoryName: cat.name,
        amount: rounded,
      })
      dayTotal += rounded
    }

    dayResult.dayTotal = dayTotal
    totalAllocated += dayTotal

    allocations.push(dayResult)
  }

  if (totalAllocated < totalBudget) {
    const priorityDays = allocations
      .filter((a) => a.isWorkingDay)
      .sort((a, b) => dailyWeights[DAY_NAMES[b.dayOfWeek]] - dailyWeights[DAY_NAMES[a.dayOfWeek]])
    let idx = 0
    while (totalAllocated < totalBudget) {
      const day = priorityDays[idx % priorityDays.length]
      day.allocations[0].amount += ROUND_TO
      day.dayTotal += ROUND_TO
      totalAllocated += ROUND_TO
      idx++
    }
  }

  return {
    allocations,
    metadata: {
      targetTotal: totalBudget,
      allocatedTotal: Math.round(totalAllocated * 100) / 100,
      variance: Math.round((totalAllocated - totalBudget) * 100) / 100,
    },
  }
}
