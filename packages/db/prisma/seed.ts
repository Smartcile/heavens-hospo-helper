import { prisma } from '../index'
import { Role, CompletionType, ScheduleType } from '@prisma/client'
import bcrypt from 'bcryptjs'

async function main() {
  console.log('Seeding database...')

  // Clean up old BAR department and its staff/training references
  const oldBarDept = await prisma.department.findUnique({ where: { id: '00000000-0000-0000-0000-000000000010' } })
  if (oldBarDept?.name === 'BAR') {
    await prisma.department.update({ where: { id: oldBarDept.id }, data: { deletedAt: new Date() } })
  }
  // Soft-delete old staff accounts that no longer exist in this seed
  await prisma.staff.updateMany({
    where: { id: '00000000-0000-0000-0000-000000000023' },
    data: { deletedAt: null, isActive: true },
  })

  // Create venue
  const venue = await prisma.venue.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'DEMO VENUE — AUCKLAND',
      address: '123 Demo Street, Auckland 1010',
      timezone: 'Pacific/Auckland',
      isActive: true,
    },
  })

  // Create departments
  const deptBOH = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'BACK OF HOUSE',
      venueId: venue.id,
      colour: '#FACC15',
      isActive: true,
    },
  })

  const deptFOH = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      name: 'FRONT OF HOUSE',
      venueId: venue.id,
      colour: '#F5F5F5',
      isActive: true,
    },
  })

  // Create staff. Admin/manager profiles log into the web panel with
  // email + password; PINs remain for QR + numpad worker login.
  const pinAdmin = await bcrypt.hash('0000', 10)
  const pinManager = await bcrypt.hash('1111', 10)
  const pwAdmin = await bcrypt.hash('admin1234', 10)
  const pwBoh = await bcrypt.hash('boh1234', 10)
  const pwFoh = await bcrypt.hash('foh1234', 10)
  // Staff PINs
  const pinStaff1 = await bcrypt.hash('1234', 10)
  const pinStaff2 = await bcrypt.hash('2345', 10)
  const pinStaff3 = await bcrypt.hash('3456', 10)
  const pinStaff4 = await bcrypt.hash('4567', 10)

  const adminStaff = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: { email: 'admin@demo.com', password: pwAdmin },
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      firstName: 'ADMIN',
      lastName: 'USER',
      pin: pinAdmin,
      email: 'admin@demo.com',
      password: pwAdmin,
      role: Role.ADMIN,
      venueId: venue.id,
      isActive: true,
    },
  })

  const bohManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: { email: 'boh@demo.com', password: pwBoh },
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      firstName: 'BOH',
      lastName: 'MANAGER',
      pin: pinManager,
      email: 'boh@demo.com',
      password: pwBoh,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptBOH.id,
      hourlyRate: 28,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const fohManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000023' },
    update: { email: 'foh@demo.com', password: pwFoh },
    create: {
      id: '00000000-0000-0000-0000-000000000023',
      firstName: 'FOH',
      lastName: 'MANAGER',
      pin: pinManager,
      email: 'foh@demo.com',
      password: pwFoh,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptFOH.id,
      hourlyRate: 28,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  // Dummy STAFF members for testing
  const staffBoh1 = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: { email: 'chef@demo.com' },
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      firstName: 'ALEX',
      lastName: 'CHEN',
      pin: pinStaff1,
      email: 'chef@demo.com',
      role: Role.STAFF,
      venueId: venue.id,
      departmentId: deptBOH.id,
      hourlyRate: 25,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const staffBoh2 = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      firstName: 'JORDAN',
      lastName: 'PATEL',
      pin: pinStaff2,
      role: Role.STAFF,
      venueId: venue.id,
      departmentId: deptBOH.id,
      hourlyRate: 23.5,
      employmentType: 'PART_TIME',
      isActive: true,
    },
  })

  const staffFoh1 = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000032',
      firstName: 'SAM',
      lastName: 'WILSON',
      pin: pinStaff3,
      role: Role.STAFF,
      venueId: venue.id,
      departmentId: deptFOH.id,
      hourlyRate: 24,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const staffFoh2 = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000033' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000033',
      firstName: 'TAYLOR',
      lastName: 'REED',
      pin: pinStaff4,
      role: Role.STAFF,
      venueId: venue.id,
      departmentId: deptFOH.id,
      hourlyRate: 22,
      employmentType: 'CASUAL',
      isActive: true,
    },
  })

  // --- One-time migration for existing installs ---
  // Earlier builds stored the admin login email in `swiftPosId` and used the
  // PIN as the password. Backfill the new email/password fields from those so
  // nobody is locked out, and free up swiftPosId for real SwiftPOS ids.
  const legacyAdmins = await prisma.staff.findMany({
    where: {
      role: { in: [Role.ADMIN, Role.MANAGER] },
      deletedAt: null,
      email: null,
      swiftPosId: { contains: '@' },
    },
  })
  for (const s of legacyAdmins) {
    await prisma.staff.update({
      where: { id: s.id },
      data: {
        email: s.swiftPosId!.toLowerCase().trim(),
        password: s.password ?? s.pin, // reuse existing bcrypt hash if no password yet
        swiftPosId: null,
      },
    })
  }

  // ── TASKS ────────────────────────────────────────────────────────────────
  // ID prefix: 0001=daily, 0002=weekly, 0003=monthly, 0004=one-off
  // BOH = BOH department, FOH = FOH dept, VEN = whole venue

  // ── BOH DAILY (8 tasks, varied types) ──
  const bohDailyTasks = [
    { title: 'CHECK FRIDGE TEMPERATURES', description: 'Record all fridge and freezer temperatures. Alert manager if any unit is outside safe range.', type: CompletionType.TICK_NOTE },
    { title: 'SANITISE ALL PREP SURFACES', description: 'Clean and sanitise cutting boards, prep benches, and utensil stations.', type: CompletionType.TICK },
    { title: 'CHECK OIL LEVELS IN FRYERS', description: 'Inspect oil quality — top up or schedule a full oil change if dark or foaming.', type: CompletionType.TICK },
    { title: 'RESTOCK DRY STORE', description: 'Rotate FIFO stock. Bring older items forward. Note any shortages on the order sheet.', type: CompletionType.TICK_NOTE },
    { title: 'EMPTY AND CLEAN BIN AREA', description: 'Empty all bins, wash bin area with hot water and sanitiser. Replace bin liners.', type: CompletionType.TICK_PHOTO },
    { title: 'SHARPEN AND SANITISE KNIVES', description: 'Run all chef knives through the sharpener. Sanitise handles and return to the knife rack.', type: CompletionType.TICK },
    { title: 'CHECK AND DATE-LABEL DELIVERIES', description: 'Inspect all incoming produce, meat, and dry goods against delivery dockets. Date-label everything.', type: CompletionType.TICK_NOTE },
    { title: 'WIPE DOWN PASS AND EXPO AREA', description: 'Clean the pass bench, heat lamps, and ticket rail. Restock plating garnishes and cloths.', type: CompletionType.TICK },
  ]

  for (let i = 0; i < bohDailyTasks.length; i++) {
    const { type, ...task } = bohDailyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptBOH.id,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // ── BOH WEEKLY (4 tasks, varied days) ──
  const bohWeeklyTasks = [
    { title: 'DEEP CLEAN BEHIND ALL EQUIPMENT', description: 'Pull out ovens, fryers, and fridges. Sweep, mop, and sanitise the full floor area behind cookline.', days: [1] },
    { title: 'CALIBRATE ALL PROBE THERMOMETERS', description: 'Test every probe against the ice-water method (0°C). Log readings and replace any out-of-spec units.', days: [3] },
    { title: 'DESCALE DISHWASHER AND SINKS', description: 'Run a descale cycle on the dishwasher. Scrub all sink basins and taps with descaler.', days: [4] },
    { title: 'FULL DRY-STORE STOCKTAKE', description: 'Count every dry-goods item. Update the order sheet and flag anything running low for reorder.', days: [6] },
  ]

  for (let i = 0; i < bohWeeklyTasks.length; i++) {
    const { days, ...task } = bohWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptBOH.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: bohDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ── BOH MONTHLY (2 tasks, 1st and 15th) ──
  const bohMonthlyTasks = [
    { title: 'DEEP CLEAN EXHAUST HOODS AND FILTERS', description: 'Remove hood filters, soak in degreaser overnight. Wipe down hood interior and replace filters.', monthlyOption: 'FIRST_DAY' },
    { title: 'AUDIT AND ROTATE CHEMICAL STOCK', description: 'Count all cleaning chemicals. Check expiry dates. Rotate stock and place reorder for low items.', monthlyOption: 'FIFTEENTH' },
    { title: 'PEST CONTROL INSPECTION', description: 'Check bait stations and traps. Record any activity. Seal any gaps or cracks found. Photo of each station required.', monthlyOption: 'LAST_DAY' },
  ]

  for (let i = 0; i < bohMonthlyTasks.length; i++) {
    const { monthlyOption, ...task } = bohMonthlyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0003-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptBOH.id,
        completionType: i === 2 ? CompletionType.TICK_PHOTO : CompletionType.TICK_NOTE,
        scheduleType: 'MONTHLY',
        scheduleDays: [],
        intervalMonths: 1,
        monthlyOption,
        sortOrder: bohDailyTasks.length + bohWeeklyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ── FOH DAILY (8 tasks, varied types) ──
  const fohDailyTasks = [
    { title: 'POLISH ALL CUTLERY AND GLASSWARE', description: 'Ensure no water spots or smudges on all service cutlery, wine glasses, and water glasses.', type: CompletionType.TICK },
    { title: 'CHECK AND FILL CONDIMENT STATIONS', description: 'Salt, pepper, sauces, napkins, and toothpicks all fully stocked and wiped down.', type: CompletionType.TICK },
    { title: 'INSPECT ALL TABLE SETTINGS', description: 'Walk every table — check alignment, spacing, clean tablecloths, and correct place-setting layout.', type: CompletionType.TICK },
    { title: 'CHECK CUSTOMER BATHROOMS', description: 'Inspect soap, paper, and cleanliness. Replenish supplies. Photo of each bathroom at open.', type: CompletionType.TICK_PHOTO },
    { title: 'BRIEF FLOOR TEAM ON SPECIALS', description: 'Run through today\'s specials, 86\'d items, allergens, and large-party bookings with the whole floor team.', type: CompletionType.TICK_NOTE },
    { title: 'WIPE DOWN ALL MENUS AND DRINKS LISTS', description: 'Sanitise every physical menu, wine list, and specials card. Replace any torn or stained copies.', type: CompletionType.TICK },
    { title: 'COUNT AND VERIFY OPENING FLOAT', description: 'Count the cash float against the POS record. Log any discrepancy and sign off with a manager.', type: CompletionType.TICK_NOTE },
    { title: 'SWEEP AND SPOT-MOP ENTRYWAY', description: 'Sweep the front entrance, mats, and foyer area. Spot-mop any visible marks. Check for trip hazards.', type: CompletionType.TICK },
  ]

  for (let i = 0; i < fohDailyTasks.length; i++) {
    const { type, ...task } = fohDailyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0005-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0005-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptFOH.id,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // ── FOH WEEKLY (4 tasks, varied days) ──
  const fohWeeklyTasks = [
    { title: 'DEEP CLEAN ALL BOOTHS AND UPHOLSTERY', description: 'Vacuum all booth seats, spot-clean any stains. Wipe down booth backs and dividers.', days: [1] },
    { title: 'POLISH ALL GLASS DOORS AND MIRRORS', description: 'Use glass cleaner on every internal glass door, partition, and decorative mirror. Streak-free finish required.', days: [2] },
    { title: 'CHECK AND REORDER FRONT-OF-HOUSE SUPPLIES', description: 'Count napkins, straws, toothpicks, reservation cards, and FOH consumables. Place order if stock is below par.', days: [4] },
    { title: 'INVENTORY WINE AND BAR FRIDGE STOCK', description: 'Count every bottle in the wine rack and bar fridges. Cross-check against the last order and note usage.', days: [5] },
  ]

  for (let i = 0; i < fohWeeklyTasks.length; i++) {
    const { days, ...task } = fohWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0006-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0006-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptFOH.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: fohDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ── FOH MONTHLY (2 tasks) ──
  const fohMonthlyTasks = [
    { title: 'AUDIT LOST PROPERTY AND LOG', description: 'Check the lost-property drawer. Log any unclaimed items older than 30 days and escalate to the venue manager.', monthlyOption: 'FIRST_DAY' },
    { title: 'REVIEW AND UPDATE RESERVATION SYSTEM', description: 'Audit the next 6 weeks of reservations for double-bookings or gaps. Update table-allocation notes in the system.', monthlyOption: 'LAST_DAY' },
  ]

  for (let i = 0; i < fohMonthlyTasks.length; i++) {
    const { monthlyOption, ...task } = fohMonthlyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0007-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0007-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptFOH.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: 'MONTHLY',
        scheduleDays: [],
        intervalMonths: 1,
        monthlyOption,
        sortOrder: fohDailyTasks.length + fohWeeklyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ── WHOLE-VENUE DAILY (3 tasks — show for everyone regardless of dept) ──
  const venueDailyTasks = [
    { title: 'CHECK ALL FIRE EXITS ARE CLEAR', description: 'Walk every fire exit — ensure the path is unobstructed and the door opens freely from inside.', type: CompletionType.TICK },
    { title: 'TEST FIRE ALARM PANEL INDICATOR', description: 'Confirm the panel shows a green ready light. Note any amber or red warnings in the log for the manager.', type: CompletionType.TICK_NOTE },
    { title: 'INSPECT STAFF ROOM CLEANLINESS', description: 'Check the staff break area — clear rubbish, wipe tables, restock tea/coffee station if needed.', type: CompletionType.TICK },
  ]

  for (let i = 0; i < venueDailyTasks.length; i++) {
    const { type, ...task } = venueDailyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0008-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0008-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: null,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // ── WHOLE-VENUE WEEKLY (2 tasks) ──
  const venueWeeklyTasks = [
    { title: 'TEST EMERGENCY LIGHTING SYSTEM', description: 'Kill the main lighting circuit and confirm all emergency exit lights illuminate for at least 30 seconds. Record test in log.', days: [1] },
    { title: 'CHECK FIRST-AID KIT CONTENTS', description: 'Open every first-aid kit on site. Restock any used items. Check expiry dates on sterile dressings. Sign the inspection card.', days: [1] },
  ]

  for (let i = 0; i < venueWeeklyTasks.length; i++) {
    const { days, ...task } = venueWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0009-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0009-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: null,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: venueDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ── ONE-OFF / SIDE-WORK TASKS (4 tasks — test rollover) ──
  const today = new Date()
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`

  const oneOffTasks = [
    { title: 'FIX LOOSE TABLE LEG IN BOOTH 3', description: 'The front-left leg on Booth 3 wobbles. Tighten the bracket or call maintenance if the thread is stripped. Photo of the fix required.', deptId: deptFOH.id, dueOffset: 0, rollover: true, type: CompletionType.TICK_PHOTO },
    { title: 'REPLACE BLOWN BULB ABOVE PASS', description: 'The third heat-lamp bulb above the pass has blown. Replace from spares cupboard (Bay E, Shelf 2).', deptId: deptBOH.id, dueOffset: 0, rollover: true, type: CompletionType.TICK },
    { title: 'WIPE DOWN ALL LIGHT SWITCHES AND DOOR HANDLES', description: 'High-touch deep clean — every light switch, door handle, and push-plate in the venue with sanitiser wipes.', deptId: null, dueOffset: -1, rollover: true, type: CompletionType.TICK },
    { title: 'ORGANISE THE STORAGE CLOSET UNDER THE STAIRS', description: 'Sort, label, and stack everything properly. Photo of the finished closet for the group chat.', deptId: deptFOH.id, dueOffset: 0, rollover: false, type: CompletionType.TICK_PHOTO },
  ]

  for (let i = 0; i < oneOffTasks.length; i++) {
    const { deptId, dueOffset, rollover, type, ...task } = oneOffTasks[i]
    const dueDate = new Date(today)
    dueDate.setUTCDate(dueDate.getUTCDate() + dueOffset)
    const dueStr = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(dueDate.getUTCDate()).padStart(2, '0')}`

    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0004-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0004-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptId,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        isOneOff: true,
        dueDate: new Date(dueStr),
        rolloverEnabled: rollover,
        rolledOverFrom: dueOffset < 0 ? new Date(yesterdayStr) : null,
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // ── CHECKLISTS ────────────────────────────────────────────────────────────

  async function upsertChecklist(id: string, name: string, desc: string | null, deptId: string | null, appearFrom: string | null, taskIds: string[]) {
    await prisma.checklist.upsert({
      where: { id },
      update: { name, description: desc, departmentId: deptId, appearFromTime: appearFrom },
      create: { id, name, description: desc, venueId: venue.id, departmentId: deptId, appearFromTime: appearFrom },
    })
    await prisma.checklistTask.deleteMany({ where: { checklistId: id } })
    await prisma.checklistTask.createMany({
      data: taskIds.map((taskId, i) => ({ checklistId: id, taskId, sortOrder: i })),
    })
  }

  // Collect task IDs
  const bohDailyIds = bohDailyTasks.map((_, i) => `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`)
  const bohWeeklyIds = bohWeeklyTasks.map((_, i) => `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`)
  const fohDailyIds = fohDailyTasks.map((_, i) => `00000000-0000-0000-0005-${String(i).padStart(12, '0')}`)
  const fohWeeklyIds = fohWeeklyTasks.map((_, i) => `00000000-0000-0000-0006-${String(i).padStart(12, '0')}`)
  const venueDailyIds = venueDailyTasks.map((_, i) => `00000000-0000-0000-0008-${String(i).padStart(12, '0')}`)
  const venueWeeklyIds = venueWeeklyTasks.map((_, i) => `00000000-0000-0000-0009-${String(i).padStart(12, '0')}`)
  const bohMonthlyIds = bohMonthlyTasks.map((_, i) => `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`)
  const fohMonthlyIds = fohMonthlyTasks.map((_, i) => `00000000-0000-0000-0007-${String(i).padStart(12, '0')}`)
  const oneOffIds = oneOffTasks.map((_, i) => `00000000-0000-0000-0004-${String(i).padStart(12, '0')}`)

  // BOH OPEN — appears from 07:00
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000001',
    'BOH OPEN',
    'Morning opening routine for the kitchen.',
    deptBOH.id,
    '07:00',
    [...bohDailyIds.slice(0, 5), bohDailyIds[5], bohDailyIds[7]]
  )

  // BOH CLOSE — appears from 16:00
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000002',
    'BOH CLOSE',
    'End-of-shift close down.',
    deptBOH.id,
    '16:00',
    [bohDailyIds[2], bohDailyIds[4], bohDailyIds[6]]
  )

  // BOH WEEKLY CLEAN — appears from 08:00 on Monday only
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000003',
    'BOH WEEKLY CLEAN',
    'Monday morning deep-clean routine.',
    deptBOH.id,
    '08:00',
    [...bohWeeklyIds, ...bohMonthlyIds.slice(0, 2)]
  )

  // FOH OPEN — appears from 09:00
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000004',
    'FOH OPEN',
    'Morning opening routine for front of house.',
    deptFOH.id,
    '09:00',
    [...fohDailyIds.slice(0, 5), fohDailyIds[6], fohDailyIds[7]]
  )

  // FOH CLOSE — appears from 17:00
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000005',
    'FOH CLOSE',
    'End-of-shift close down for the floor.',
    deptFOH.id,
    '17:00',
    [fohDailyIds[0], fohDailyIds[3], fohDailyIds[5]]
  )

  // FOH WEEKLY — appears from 10:00 on Tuesday
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000006',
    'FOH WEEKLY ROUTINE',
    'Mid-week maintenance tasks.',
    deptFOH.id,
    '10:00',
    fohWeeklyIds
  )

  // SIDE WORK — whole venue, no time gate (always visible)
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000007',
    'SIDE WORK',
    'Ad-hoc and one-off tasks from the team. Any department can pick these up.',
    null,
    null,
    [...oneOffIds, bohDailyIds[6], fohDailyIds[5]]
  )

  // WHOLE VENUE — no time gate
  await upsertChecklist(
    '00000000-0000-0000-00c0-000000000008',
    'WHOLE VENUE',
    'Safety and facility tasks for everyone.',
    null,
    null,
    [...venueDailyIds, ...venueWeeklyIds]
  )

  // QR Codes
  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000031', venueId: venue.id, label: 'BOH ENTRY QR', isActive: true },
  })

  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000032', venueId: venue.id, label: 'FOH ENTRY QR', isActive: true },
  })

  // --- Built-in task templates (Phase 2) ---
  // Curated SOP sets an admin can apply to any department in one click.
  // Re-seeding refreshes the items so built-ins stay in sync with the code.
  const builtInTemplates: {
    id: string
    name: string
    description: string
    category: string
    items: {
      title: string
      description?: string
      completionType?: 'TICK' | 'TICK_NOTE' | 'TICK_PHOTO'
      scheduleType?: 'DAILY' | 'WEEKLY'
      scheduleDays?: number[]
    }[]
  }[] = [
    {
      id: '00000000-0000-0000-00a0-000000000001',
      name: 'BOH OPEN',
      description: 'Opening checklist for back of house.',
      category: 'BOH',
      items: [
        { title: 'RECORD ALL FRIDGE AND FREEZER TEMPERATURES', completionType: 'TICK_NOTE' },
        { title: 'CHECK OIL LEVELS AND QUALITY IN FRYERS', completionType: 'TICK' },
        { title: 'SANITISE ALL PREP SURFACES', completionType: 'TICK' },
        { title: 'CHECK DELIVERIES AGAINST DOCKETS', completionType: 'TICK_NOTE' },
        { title: 'PREP MISE EN PLACE FOR SERVICE', completionType: 'TICK' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000002',
      name: 'BOH CLOSE',
      description: 'Closing checklist for back of house.',
      category: 'BOH',
      items: [
        { title: 'RECORD CLOSING FRIDGE TEMPERATURES', completionType: 'TICK_NOTE' },
        { title: 'CLEAN AND DEGREASE COOKLINE', completionType: 'TICK' },
        { title: 'EMPTY AND SANITISE BINS', completionType: 'TICK' },
        { title: 'WRAP, LABEL AND DATE ALL OPEN STOCK', completionType: 'TICK' },
        { title: 'PHOTO OF CLEAN BOH FOR HANDOVER', completionType: 'TICK_PHOTO' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000003',
      name: 'FOH OPEN',
      description: 'Opening checklist for front of house.',
      category: 'FRONT OF HOUSE',
      items: [
        { title: 'POLISH ALL CUTLERY AND GLASSWARE', completionType: 'TICK' },
        { title: 'SET ALL TABLES TO STANDARD LAYOUT', completionType: 'TICK' },
        { title: 'FILL CONDIMENT AND NAPKIN STATIONS', completionType: 'TICK' },
        { title: 'CHECK AND CLEAN CUSTOMER BATHROOMS', completionType: 'TICK_PHOTO' },
        { title: 'BRIEF FLOOR TEAM ON SPECIALS AND ALLERGENS', completionType: 'TICK_NOTE' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000004',
      name: 'FOH CLOSE',
      description: 'Closing checklist for front of house.',
      category: 'FRONT OF HOUSE',
      items: [
        { title: 'CLEAR, WIPE AND RESET ALL TABLES', completionType: 'TICK' },
        { title: 'STACK AND CHARGE EFTPOS TERMINALS', completionType: 'TICK' },
        { title: 'SWEEP AND MOP FLOOR', completionType: 'TICK' },
        { title: 'RESTOCK FOR NEXT SERVICE', completionType: 'TICK' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000005',
      name: 'WEEKLY DEEP CLEAN',
      description: 'Weekly deep-clean tasks (defaults to Monday).',
      category: 'GENERAL',
      items: [
        { title: 'DEEP CLEAN BEHIND ALL EQUIPMENT', completionType: 'TICK_PHOTO', scheduleType: 'WEEKLY', scheduleDays: [1] },
        { title: 'DESCALE SINKS AND TAPS', completionType: 'TICK', scheduleType: 'WEEKLY', scheduleDays: [1] },
        { title: 'FULL STOCKTAKE AND REORDER', completionType: 'TICK_NOTE', scheduleType: 'WEEKLY', scheduleDays: [1] },
      ],
    },
  ]

  for (const tpl of builtInTemplates) {
    await prisma.taskTemplate.upsert({
      where: { id: tpl.id },
      update: { name: tpl.name, description: tpl.description, category: tpl.category, isBuiltIn: true },
      create: {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        isBuiltIn: true,
        venueId: null,
      },
    })
    // Keep items in sync with code on every seed.
    await prisma.taskTemplateItem.deleteMany({ where: { templateId: tpl.id } })
    await prisma.taskTemplateItem.createMany({
      data: tpl.items.map((item, i) => ({
        templateId: tpl.id,
        title: item.title,
        description: item.description ?? null,
        completionType: item.completionType ?? 'TICK',
        scheduleType: item.scheduleType ?? 'DAILY',
        scheduleDays: item.scheduleDays ?? [],
        sortOrder: i,
      })),
    })
  }

  // --- Example training modules (Phase 3) ---
  // Varied: TRAINING / SOP / FAQ / HOWTO kinds, with and without sign-off,
  // onboarding and non-onboarding, linked to tasks and checklists.
  const trainingModules: {
    id: string
    title: string
    description: string
    category: string
    departmentId?: string
    linkedTaskId?: string
    requiresSignOff: boolean
    isOnboarding: boolean
    onboardingOrder: number
    kind: string
    steps: { title?: string; content: string; videoUrl?: string; imageUrl?: string; linkedChecklistId?: string }[]
  }[] = [
    // ── ONBOARDING (all staff, no sign-off) ──
    {
      id: '00000000-0000-0000-00b0-000000000001',
      title: 'WELCOME & VENUE INDUCTION',
      description: 'Start here on your first shift — covers the basics for every new team member. [TRAINING · SELF-COMPLETE · ONBOARDING]',
      category: 'ONBOARDING',
      kind: 'TRAINING',
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 1,
      steps: [
        { title: 'WELCOME', content: 'Welcome to the team! This short induction covers the basics before your first shift.' },
        { title: 'WHERE THINGS ARE', content: 'Find the staff room, lockers, first-aid kit, and fire exits. Ask your manager for a quick tour.' },
        { title: 'USING THIS APP', content: 'Each shift, scan the QR at your area and enter your PIN to see your tasks. Tick them off as you go.' },
      ],
    },

    // ── ONBOARDING (all staff, requires sign-off) ──
    {
      id: '00000000-0000-0000-00b0-000000000002',
      title: 'FOOD SAFETY BASICS',
      description: 'Core hygiene and food-handling rules every staff member must know. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · WHOLE VENUE]',
      category: 'FOOD SAFETY',
      kind: 'TRAINING',
      requiresSignOff: true,
      isOnboarding: true,
      onboardingOrder: 2,
      steps: [
        { title: 'HAND WASHING', content: 'Wash hands for 20 seconds on arrival, after breaks, and between tasks. Use the hand-wash sink only — never the prep sink.' },
        { title: 'TEMPERATURE DANGER ZONE', content: 'Keep cold food below 5°C and hot food above 60°C. Record fridge temps daily using the TEMP LOG sheet posted on the cool-room door.' },
        { title: 'CROSS-CONTAMINATION', content: 'Use separate colour-coded boards for raw meat (red), poultry (yellow), seafood (blue), and ready-to-eat (white).' },
      ],
    },

    // ── BOH TRAINING (department-scoped, requires sign-off, linked to task) ──
    {
      id: '00000000-0000-0000-00b0-000000000003',
      title: 'FRYER SAFETY & OIL MANAGEMENT',
      description: 'How to safely check, change, and dispose of fryer oil. Linked to the daily fryer task. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · BOH ONLY]',
      category: 'BOH',
      kind: 'TRAINING',
      departmentId: deptBOH.id,
      linkedTaskId: '00000000-0000-0000-0001-000000000002',
      requiresSignOff: true,
      isOnboarding: true,
      onboardingOrder: 3,
      steps: [
        { title: 'BEFORE YOU START', content: 'Wait for oil to cool below 50°C. Wear heat-resistant gloves and a splash apron.' },
        { title: 'DAILY CHECK', content: 'Oil should be clear and amber. If dark, foaming, or smoking at normal temp — change it.' },
        { title: 'OIL CHANGE PROCESS', content: 'Drain into the oil caddy using the fitted valve. Clean the tank before refilling. Never carry hot oil in open containers.', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { title: 'DISPOSAL', content: 'Used oil goes into the yellow collection drum out back — never down the drain. Record volume on the oil-log sheet.' },
      ],
    },

    // ── BOH TRAINING (chemical safety, requires sign-off) ──
    {
      id: '00000000-0000-0000-00b0-000000000005',
      title: 'CHEMICAL HANDLING & SAFETY',
      description: 'Correct use of cleaning chemicals, PPE, and spill response. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · BOH ONLY]',
      category: 'BOH',
      kind: 'TRAINING',
      departmentId: deptBOH.id,
      requiresSignOff: true,
      isOnboarding: true,
      onboardingOrder: 4,
      steps: [
        { title: 'READ THE LABEL', content: 'Always read the label before using any chemical. Note the dilution ratio and required PPE (gloves, goggles, apron).' },
        { title: 'COLOUR-CODED BOTTLES', content: 'RED = heavy degreaser. BLUE = general sanitiser. GREEN = glass cleaner. Never mix chemicals or refill the wrong bottle.' },
        { title: 'SPILL RESPONSE', content: 'For small spills: wear gloves, apply absorbent granules, sweep into the yellow waste bag. For large spills: evacuate the area and notify a manager immediately.' },
      ],
    },

    // ── FOH TRAINING (self-complete, no sign-off) ──
    {
      id: '00000000-0000-0000-00b0-000000000004',
      title: 'FOH SERVICE STANDARDS',
      description: 'Table-setting, greeting, and service flow standards. [TRAINING · SELF-COMPLETE · ONBOARDING · FOH ONLY]',
      category: 'FOH',
      kind: 'TRAINING',
      departmentId: deptFOH.id,
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 3,
      steps: [
        { title: 'TABLE SETTINGS', content: 'Cutlery 2cm from table edge. Wine glass at 1 o\'clock, water at 11 o\'clock. Napkin folded centre.', imageUrl: 'https://placehold.co/600x400/FACC15/0A0A0A?text=Place+Setting+Diagram' },
        { title: 'GREETING GUESTS', content: 'Welcome within 30 seconds of seating. Offer water immediately. Introduce yourself by name.' },
        { title: 'ALLERGEN AWARENESS', content: 'Always ask about allergies when taking orders. Mark dockets clearly. Confirm with kitchen before serving.' },
      ],
    },

    // ── SOP (BOH, linked to checklist) ──
    {
      id: '00000000-0000-0000-00b0-000000000006',
      title: 'BOH MORNING OPENING PROCEDURE',
      description: 'Standard operating procedure for kitchen open — follow the BOH OPEN checklist. [SOP · SELF-COMPLETE · BOH ONLY]',
      category: 'BOH',
      kind: 'SOP',
      departmentId: deptBOH.id,
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 5,
      steps: [
        { title: 'ARRIVE AND CHECK IN', content: 'Scan the BOH QR code at the kitchen entrance. Clock in and review today\'s task list.' },
        { title: 'TEMPERATURE CHECKS FIRST', content: 'Before anything else, record all fridge and freezer temperatures. Any unit outside 0-5°C (fridge) or below -18°C (freezer) must be reported immediately.', linkedChecklistId: '00000000-0000-0000-00c0-000000000001' },
        { title: 'MISE EN PLACE', content: 'Set up your station with everything you need for service. Check prep levels against the par sheet.', imageUrl: 'https://placehold.co/600x400/4ADE80/0A0A0A?text=Mise+En+Place+Setup' },
      ],
    },

    // ── SOP (FOH, linked to checklist) ──
    {
      id: '00000000-0000-0000-00b0-000000000007',
      title: 'FOH END-OF-NIGHT CLOSE',
      description: 'Standard operating procedure for closing the floor. Linked to the FOH CLOSE checklist. [SOP · SELF-COMPLETE · FOH ONLY]',
      category: 'FOH',
      kind: 'SOP',
      departmentId: deptFOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      onboardingOrder: 0,
      steps: [
        { title: 'LAST GUEST LEAVES', content: 'Once the last guest has left, begin closing duties. Do not rush guests — let them finish naturally.' },
        { title: 'CLEAR AND RESET', content: 'Clear all tables, wipe down, and reset to the standard layout for tomorrow\'s service. Stack chairs on tables in the area being mopped.', linkedChecklistId: '00000000-0000-0000-00c0-000000000005' },
        { title: 'EFTPOS AND TILL', content: 'Close out all terminals. Print the end-of-day report. Count the float and lock it in the safe. Both a manager and the closing staff member must sign the cash-up sheet.' },
      ],
    },

    // ── FAQ (whole-venue, no sign-off) ──
    {
      id: '00000000-0000-0000-00b0-000000000008',
      title: 'COMMON ALLERGEN QUESTIONS',
      description: 'Quick reference for the most common dietary and allergen questions from guests. [FAQ · SELF-COMPLETE · WHOLE VENUE]',
      category: 'ALLERGENS',
      kind: 'FAQ',
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 6,
      steps: [
        { title: 'GLUTEN-FREE OPTIONS', content: 'All grilled proteins are GF. Any dish with the GF symbol on the menu can be made coeliac-safe. Always confirm with the kitchen and mark the docket CLEARLY.' },
        { title: 'DAIRY-FREE', content: 'We use a plant-based butter alternative for dairy-free requests. Most sauces can be modified. The vegan dessert is always dairy-free.' },
        { title: 'NUT ALLERGY', content: 'We use almond meal in two desserts and peanut oil in one fryer. All other fryers use canola. Check the allergen matrix posted above the pass before answering any nut question.' },
      ],
    },

    // ── HOWTO (BOH, self-complete, linked to task) ──
    {
      id: '00000000-0000-0000-00b0-000000000009',
      title: 'HOW TO READ THE FRIDGE TEMP LOG',
      description: 'Step-by-step guide to the daily temperature recording sheet. Linked to the fridge temp task. [HOWTO · SELF-COMPLETE · BOH ONLY]',
      category: 'BOH',
      kind: 'HOWTO',
      departmentId: deptBOH.id,
      linkedTaskId: '00000000-0000-0000-0001-000000000000',
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 7,
      steps: [
        { title: 'FIND THE LOG SHEET', content: 'The temperature log clipboard hangs on the cool-room door. Each fridge and freezer has its own column.' },
        { title: 'RECORDING', content: 'Write the actual temperature reading from the unit\'s display. Do NOT write the target temperature. If the reading is outside range, circle it in RED.' },
        { title: 'SIGN AND DATE', content: 'Write your initials and the time in the STAFF column. If you circled any readings, notify the manager on duty immediately — do not wait until end of shift.' },
      ],
    },
  ]

  for (const m of trainingModules) {
    await prisma.trainingModule.upsert({
      where: { id: m.id },
      update: {
        title: m.title,
        description: m.description,
        category: m.category,
        departmentId: m.departmentId ?? null,
        linkedTaskId: m.linkedTaskId ?? null,
        requiresSignOff: m.requiresSignOff,
        isOnboarding: m.isOnboarding,
        onboardingOrder: m.onboardingOrder,
        kind: m.kind,
      },
      create: {
        id: m.id,
        title: m.title,
        description: m.description,
        category: m.category,
        venueId: venue.id,
        departmentId: m.departmentId ?? null,
        linkedTaskId: m.linkedTaskId ?? null,
        requiresSignOff: m.requiresSignOff,
        isOnboarding: m.isOnboarding,
        onboardingOrder: m.onboardingOrder,
        kind: m.kind,
      },
    })
    await prisma.trainingStep.deleteMany({ where: { moduleId: m.id } })
    await prisma.trainingStep.createMany({
      data: m.steps.map((s, i) => ({
        moduleId: m.id,
        order: i,
        title: s.title ?? null,
        content: s.content,
        videoUrl: s.videoUrl ?? null,
        imageUrl: s.imageUrl ?? null,
        linkedChecklistId: s.linkedChecklistId ?? null,
      })),
    })
  }

  // ── INDIVIDUAL TRAINING ASSIGNMENTS ──
  // Assign specific modules to specific staff with a reason.
  await prisma.trainingAssignment.deleteMany({ where: { moduleId: { in: trainingModules.map((m) => m.id) } } })
  await prisma.trainingAssignment.createMany({
    data: [
      // Alex Chen (BOH staff) — assigned Fryer Safety
      { staffId: staffBoh1.id, moduleId: '00000000-0000-0000-00b0-000000000003', reason: 'UPSKILL' },
      // Alex Chen — assigned Chemical Handling
      { staffId: staffBoh1.id, moduleId: '00000000-0000-0000-00b0-000000000005', reason: 'AREA TO WORK ON' },
      // Jordan Patel (BOH staff) — assigned How to Read Fridge Temp Log
      { staffId: staffBoh2.id, moduleId: '00000000-0000-0000-00b0-000000000009', reason: 'AREA TO WORK ON' },
      // Sam Wilson (FOH staff) — assigned FOH End-of-Night Close
      { staffId: staffFoh1.id, moduleId: '00000000-0000-0000-00b0-000000000007', reason: 'UPSKILL' },
      // Taylor Reed (FOH casual) — assigned FOH Service Standards
      { staffId: staffFoh2.id, moduleId: '00000000-0000-0000-00b0-000000000004', reason: 'ONBOARDING' },
    ],
  })

  console.log('Seed complete.')
  console.log('Admin/manager web logins (email / password):')
  console.log('  admin@demo.com / admin1234    (ADMIN)')
  console.log('  boh@demo.com   / boh1234      (BOH MANAGER)')
  console.log('  foh@demo.com   / foh1234      (FOH MANAGER)')
  console.log('')
  console.log('Staff PIN logins:')
  console.log('  1234 (Alex Chen - BOH FULL_TIME)')
  console.log('  2345 (Jordan Patel - BOH PART_TIME)')
  console.log('  3456 (Sam Wilson - FOH FULL_TIME)')
  console.log('  4567 (Taylor Reed - FOH CASUAL)')
  console.log('')
  console.log('Seed stats:')
  console.log(`  BOH: ${bohDailyTasks.length} daily + ${bohWeeklyTasks.length} weekly + ${bohMonthlyTasks.length} monthly`)
  console.log(`  FOH: ${fohDailyTasks.length} daily + ${fohWeeklyTasks.length} weekly + ${fohMonthlyTasks.length} monthly`)
  console.log(`  VENUE: ${venueDailyTasks.length} daily + ${venueWeeklyTasks.length} weekly`)
  console.log(`  ONE-OFF: ${oneOffTasks.length}`)
  console.log(`  CHECKLISTS: 8 (BOH OPEN, BOH CLOSE, BOH WEEKLY CLEAN, FOH OPEN, FOH CLOSE, FOH WEEKLY, SIDE WORK, WHOLE VENUE)`)
  console.log(`  TEMPLATES: ${builtInTemplates.length} built-in`)
  console.log(`  TRAINING: ${trainingModules.length} modules (TRAINING x5, SOP x2, FAQ x1, HOWTO x1) with 5 individual assignments`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
