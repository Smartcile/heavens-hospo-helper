import { prisma } from '../index'
import { Role, CompletionType, ScheduleType, HsCategory, StorageType } from '@prisma/client'
import bcrypt from 'bcryptjs'

// ── UUID helpers ──
function d(id: string) {
  return `00000000-0000-0000-00d0-${id.padStart(12, '0')}`
}

// Legacy seeded entity prefixes (from the original seed — cleaned up from any
// non-demo venue on redeploy)
const LEGACY_TASK_PREFIXES = ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']
const LEGACY_TASK_PATTERNS = LEGACY_TASK_PREFIXES.map((p) => `00000000-0000-0000-${p}-`)
const LEGACY_DEMO_VENUE_ID = '00000000-0000-0000-0000-000000000001'
const LEGACY_STAFF_IDS = [
  '00000000-0000-0000-0000-000000000021', // BOH MANAGER
  '00000000-0000-0000-0000-000000000023', // FOH MANAGER
  '00000000-0000-0000-0000-000000000030', // ALEX CHEN
  '00000000-0000-0000-0000-000000000031', // JORDAN PATEL
  '00000000-0000-0000-0000-000000000032', // SAM WILSON
  '00000000-0000-0000-0000-000000000033', // TAYLOR REED
]
const LEGACY_CHECKLIST_PREFIX = '00000000-0000-0000-00c0-'
const LEGACY_TRAINING_PREFIX = '00000000-0000-0000-00b0-'
const LEGACY_TEMPLATE_PREFIX = '00000000-0000-0000-00a0-'
const LEGACY_QR_IDS = [
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000032',
]
const LEGACY_TRAINING_IDS = Array.from({ length: 9 }, (_, i) =>
  `00000000-0000-0000-00b0-${String(i + 1).padStart(12, '0')}`
)
const LEGACY_TEMPLATE_IDS = Array.from({ length: 5 }, (_, i) =>
  `00000000-0000-0000-00a0-${String(i + 1).padStart(12, '0')}`
)

async function cleanupLegacyData() {
  const legacyVenue = await prisma.venue.findUnique({
    where: { id: LEGACY_DEMO_VENUE_ID, deletedAt: null },
  })

  if (!legacyVenue) {
    // Fresh install — no legacy venue exists, nothing to clean.
    return
  }

  const isStillDemo = legacyVenue.name === 'DEMO VENUE — AUCKLAND'

  if (isStillDemo) {
    // Venue 0001 is still the untouched demo venue. Mark it as demo, then
    // clean out its legacy entities (they'll be replaced by new-ID ones in
    // the new demo venue).
    await prisma.venue.update({
      where: { id: legacyVenue.id },
      data: { isDemo: true },
    })
    await softDeleteLegacyEntities(legacyVenue.id)
    return
  }

  // Venue 0001 was renamed — it's a real venue now. Only soft-delete
  // demo-looking entities from it (tasks, checklists, training, QR codes,
  // and staff that haven't been repurposed). Never touch departments or
  // staff 0020 (bootstrap admin).
  await safeCleanFromVenue(legacyVenue.id)
}

async function softDeleteLegacyEntities(venueId: string) {
  // Tasks (all legacy prefixes)
  for (const pattern of LEGACY_TASK_PATTERNS) {
    await prisma.task.updateMany({
      where: { venueId, id: { startsWith: pattern }, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  }

  // Checklists
  await prisma.checklist.updateMany({
    where: { venueId, id: { startsWith: LEGACY_CHECKLIST_PREFIX }, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  await prisma.checklistTask.deleteMany({
    where: { checklist: { venueId, id: { startsWith: LEGACY_CHECKLIST_PREFIX } } },
  })

  // Training modules
  await prisma.trainingModule.updateMany({
    where: { venueId, id: { in: LEGACY_TRAINING_IDS }, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  await prisma.trainingStep.deleteMany({
    where: { moduleId: { in: LEGACY_TRAINING_IDS } },
  })
  await prisma.trainingAssignment.deleteMany({
    where: { moduleId: { in: LEGACY_TRAINING_IDS } },
  })

  // Templates
  await prisma.taskTemplate.updateMany({
    where: { id: { startsWith: LEGACY_TEMPLATE_PREFIX }, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  await prisma.taskTemplateItem.deleteMany({
    where: { templateId: { startsWith: LEGACY_TEMPLATE_PREFIX } },
  })

  // QR codes
  await prisma.qRCode.updateMany({
    where: { venueId, id: { in: LEGACY_QR_IDS }, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  // Staff (except admin 0020)
  for (const id of LEGACY_STAFF_IDS) {
    const s = await prisma.staff.findUnique({ where: { id, venueId } })
    if (s) {
      await prisma.staff.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date(), isActive: false, email: null },
      })
    }
  }
}

async function safeCleanFromVenue(venueId: string) {
  // Only remove demo entities from a non-demo venue.
  // Staff: skip if repurposed (email changed from @demo.com). Staff 0020 never touched.
  for (const id of LEGACY_STAFF_IDS) {
    const s = await prisma.staff.findUnique({ where: { id, venueId } })
    if (!s || s.deletedAt) continue
    // If email was changed from the @demo.com pattern, it's been repurposed — keep it.
    if (s.email && !s.email.endsWith('@demo.com')) continue
    // Soft-delete and null the email so the new demo staff can reuse @demo.com emails.
    await prisma.staff.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false, email: null },
    })
  }

  // Tasks, checklists, training, templates, QR codes — all known legacy IDs can go
  await softDeleteLegacyEntities(venueId)
}

async function main() {
  console.log('Seeding database...')

  // ─── Phase 0: Legacy cleanup ─────────────────────────────────────────
  await cleanupLegacyData()

  // ─── Phase 1: Demo venue ─────────────────────────────────────────────
  const existingNonDemo = await prisma.venue.findFirst({
    where: { deletedAt: null, isDemo: false },
  })
  // Enable demo by default on a fresh install; disable when real venues already exist
  const demoIsActive = !existingNonDemo

  const demoVenue = await prisma.venue.upsert({
    where: { id: d('000000000001') },
    update: { name: 'DEMO VENUE — AUCKLAND', isDemo: true },
    create: {
      id: d('000000000001'),
      name: 'DEMO VENUE — AUCKLAND',
      address: '123 Demo Street, Auckland 1010',
      timezone: 'Pacific/Auckland',
      isActive: demoIsActive,
      isDemo: true,
    },
  })

  // ─── Phase 2: Bootstrap admin ────────────────────────────────────────
  // Always seeded; NEVER credential-reset on re-deploy. update: {} preserves
  // whatever the admin changed their password/email to.
  const pinAdmin = await bcrypt.hash('0000', 10)
  const pwAdmin = await bcrypt.hash('admin1234', 10)

  const adminStaff = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      firstName: 'ADMIN',
      lastName: 'USER',
      pin: pinAdmin,
      email: 'admin@demo.com',
      password: pwAdmin,
      role: Role.ADMIN,
      venueId: demoVenue.id,
      isActive: true,
    },
  })

  // ─── Phase 3: Demo departments ───────────────────────────────────────
  const deptBOH = await prisma.department.upsert({
    where: { id: d('000000000010') },
    update: {},
    create: {
      id: d('000000000010'),
      name: 'BACK OF HOUSE',
      venueId: demoVenue.id,
      colour: '#FACC15',
      isActive: true,
    },
  })

  const deptFOH = await prisma.department.upsert({
    where: { id: d('000000000012') },
    update: {},
    create: {
      id: d('000000000012'),
      name: 'FRONT OF HOUSE',
      venueId: demoVenue.id,
      colour: '#F5F5F5',
      isActive: true,
    },
  })

  // ─── Phase 4: Demo staff ────────────────────────────────────────────
  const pwBoh = await bcrypt.hash('boh1234', 10)
  const pwFoh = await bcrypt.hash('foh1234', 10)
  const pinManager = await bcrypt.hash('1111', 10)
  const pinStaff1 = await bcrypt.hash('1234', 10)
  const pinStaff2 = await bcrypt.hash('2345', 10)
  const pinStaff3 = await bcrypt.hash('3456', 10)
  const pinStaff4 = await bcrypt.hash('4567', 10)

  const bohManager = await prisma.staff.upsert({
    where: { id: d('000000000021') },
    update: { email: 'boh@demo.com' },
    create: {
      id: d('000000000021'),
      firstName: 'BOH',
      lastName: 'MANAGER',
      pin: pinManager,
      email: 'boh@demo.com',
      password: pwBoh,
      role: Role.MANAGER,
      venueId: demoVenue.id,
      departmentId: deptBOH.id,
      hourlyRate: 28,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const fohManager = await prisma.staff.upsert({
    where: { id: d('000000000022') },
    update: { email: 'foh@demo.com' },
    create: {
      id: d('000000000022'),
      firstName: 'FOH',
      lastName: 'MANAGER',
      pin: pinManager,
      email: 'foh@demo.com',
      password: pwFoh,
      role: Role.MANAGER,
      venueId: demoVenue.id,
      departmentId: deptFOH.id,
      hourlyRate: 28,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  // A restricted demo manager — granular access controls in action. Unlike the
  // managers above (unrestricted = legacy full access), H&S OFFICER's access is
  // EXACTLY the StaffPermission grants below (the H&S OFFICER preset).
  const pwHs = await bcrypt.hash('hs1234', 10)
  const hsManager = await prisma.staff.upsert({
    where: { id: d('000000000023') },
    update: { email: 'hs@demo.com', restricted: true },
    create: {
      id: d('000000000023'),
      firstName: 'H&S',
      lastName: 'OFFICER',
      pin: pinManager,
      email: 'hs@demo.com',
      password: pwHs,
      role: Role.MANAGER,
      venueId: demoVenue.id,
      departmentId: deptBOH.id,
      hourlyRate: 26,
      employmentType: 'PART_TIME',
      isActive: true,
      restricted: true,
    },
  })
  await prisma.staffPermission.deleteMany({ where: { staffId: hsManager.id } })
  await prisma.staffPermission.createMany({
    data: [
      ['compliance', 'tasks', 'view'],
      ['compliance', 'tasks', 'create'],
      ['compliance', 'tasks', 'edit'],
      ['compliance', 'deliveries', 'view'],
      ['compliance', 'deliveries', 'create'],
      ['compliance', 'deliveries', 'edit'],
      ['compliance', 'alerts', 'view'],
      ['compliance', 'alerts', 'raise'],
      ['compliance', 'alerts', 'resolve'],
      ['ops', 'inventory', 'view'],
      ['notices', 'notices', 'view'],
    ].map(([area, sub, fn]) => ({
      staffId: hsManager.id,
      venueId: demoVenue.id,
      permissionKey: `${area}.${sub}.${fn}`,
    })),
  })

  const staffBoh1 = await prisma.staff.upsert({
    where: { id: d('000000000030') },
    update: {},
    create: {
      id: d('000000000030'),
      firstName: 'ALEX',
      lastName: 'CHEN',
      pin: pinStaff1,
      email: 'chef@demo.com',
      role: Role.STAFF,
      venueId: demoVenue.id,
      departmentId: deptBOH.id,
      hourlyRate: 25,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const staffBoh2 = await prisma.staff.upsert({
    where: { id: d('000000000031') },
    update: {},
    create: {
      id: d('000000000031'),
      firstName: 'JORDAN',
      lastName: 'PATEL',
      pin: pinStaff2,
      role: Role.STAFF,
      venueId: demoVenue.id,
      departmentId: deptBOH.id,
      hourlyRate: 23.5,
      employmentType: 'PART_TIME',
      isActive: true,
    },
  })

  const staffFoh1 = await prisma.staff.upsert({
    where: { id: d('000000000032') },
    update: {},
    create: {
      id: d('000000000032'),
      firstName: 'SAM',
      lastName: 'WILSON',
      pin: pinStaff3,
      role: Role.STAFF,
      venueId: demoVenue.id,
      departmentId: deptFOH.id,
      hourlyRate: 24,
      employmentType: 'FULL_TIME',
      isActive: true,
    },
  })

  const staffFoh2 = await prisma.staff.upsert({
    where: { id: d('000000000033') },
    update: {},
    create: {
      id: d('000000000033'),
      firstName: 'TAYLOR',
      lastName: 'REED',
      pin: pinStaff4,
      role: Role.STAFF,
      venueId: demoVenue.id,
      departmentId: deptFOH.id,
      hourlyRate: 22,
      employmentType: 'CASUAL',
      isActive: true,
    },
  })

  // ─── Phase 5: Demo tasks ────────────────────────────────────────────

  // BOH DAILY (8 tasks, varied types)
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
      where: { id: d(`0001${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0001${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: deptBOH.id,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // BOH WEEKLY (4 tasks, varied days)
  const bohWeeklyTasks = [
    { title: 'DEEP CLEAN BEHIND ALL EQUIPMENT', description: 'Pull out ovens, fryers, and fridges. Sweep, mop, and sanitise the full floor area behind cookline.', days: [1] },
    { title: 'CALIBRATE ALL PROBE THERMOMETERS', description: 'Test every probe against the ice-water method (0°C). Log readings and replace any out-of-spec units.', days: [3] },
    { title: 'DESCALE DISHWASHER AND SINKS', description: 'Run a descale cycle on the dishwasher. Scrub all sink basins and taps with descaler.', days: [4] },
    { title: 'FULL DRY-STORE STOCKTAKE', description: 'Count every dry-goods item. Update the order sheet and flag anything running low for reorder.', days: [6] },
  ]

  for (let i = 0; i < bohWeeklyTasks.length; i++) {
    const { days, ...task } = bohWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0002${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0002${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: deptBOH.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: bohDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // BOH MONTHLY (3 tasks)
  const bohMonthlyTasks = [
    { title: 'DEEP CLEAN EXHAUST HOODS AND FILTERS', description: 'Remove hood filters, soak in degreaser overnight. Wipe down hood interior and replace filters.', monthlyOption: 'FIRST_DAY' },
    { title: 'AUDIT AND ROTATE CHEMICAL STOCK', description: 'Count all cleaning chemicals. Check expiry dates. Rotate stock and place reorder for low items.', monthlyOption: 'FIFTEENTH' },
    { title: 'PEST CONTROL INSPECTION', description: 'Check bait stations and traps. Record any activity. Seal any gaps or cracks found. Photo of each station required.', monthlyOption: 'LAST_DAY' },
  ]

  for (let i = 0; i < bohMonthlyTasks.length; i++) {
    const { monthlyOption, ...task } = bohMonthlyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0003${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0003${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
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

  // FOH DAILY (8 tasks)
  const fohDailyTasks = [
    { title: 'POLISH ALL CUTLERY AND GLASSWARE', description: 'Ensure no water spots or smudges on all service cutlery, wine glasses, and water glasses.', type: CompletionType.TICK },
    { title: 'CHECK AND FILL CONDIMENT STATIONS', description: 'Salt, pepper, sauces, napkins, and toothpicks all fully stocked and wiped down.', type: CompletionType.TICK },
    { title: 'INSPECT ALL TABLE SETTINGS', description: 'Walk every table — check alignment, spacing, clean tablecloths, and correct place-setting layout.', type: CompletionType.TICK },
    { title: 'CHECK CUSTOMER BATHROOMS', description: 'Inspect soap, paper, and cleanliness. Replenish supplies. Photo of each bathroom at open.', type: CompletionType.TICK_PHOTO },
    { title: 'BRIEF FLOOR TEAM ON SPECIALS', description: "Run through today's specials, 86'd items, allergens, and large-party bookings with the whole floor team.", type: CompletionType.TICK_NOTE },
    { title: 'WIPE DOWN ALL MENUS AND DRINKS LISTS', description: 'Sanitise every physical menu, wine list, and specials card. Replace any torn or stained copies.', type: CompletionType.TICK },
    { title: 'COUNT AND VERIFY OPENING FLOAT', description: 'Count the cash float against the POS record. Log any discrepancy and sign off with a manager.', type: CompletionType.TICK_NOTE },
    { title: 'SWEEP AND SPOT-MOP ENTRYWAY', description: 'Sweep the front entrance, mats, and foyer area. Spot-mop any visible marks. Check for trip hazards.', type: CompletionType.TICK },
  ]

  for (let i = 0; i < fohDailyTasks.length; i++) {
    const { type, ...task } = fohDailyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0005${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0005${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: deptFOH.id,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // FOH WEEKLY (4 tasks)
  const fohWeeklyTasks = [
    { title: 'DEEP CLEAN ALL BOOTHS AND UPHOLSTERY', description: 'Vacuum all booth seats, spot-clean any stains. Wipe down booth backs and dividers.', days: [1] },
    { title: 'POLISH ALL GLASS DOORS AND MIRRORS', description: 'Use glass cleaner on every internal glass door, partition, and decorative mirror. Streak-free finish required.', days: [2] },
    { title: 'CHECK AND REORDER FRONT-OF-HOUSE SUPPLIES', description: 'Count napkins, straws, toothpicks, reservation cards, and FOH consumables. Place order if stock is below par.', days: [4] },
    { title: 'INVENTORY WINE AND BAR FRIDGE STOCK', description: 'Count every bottle in the wine rack and bar fridges. Cross-check against the last order and note usage.', days: [5] },
  ]

  for (let i = 0; i < fohWeeklyTasks.length; i++) {
    const { days, ...task } = fohWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0006${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0006${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: deptFOH.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: fohDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // FOH MONTHLY (2 tasks)
  const fohMonthlyTasks = [
    { title: 'AUDIT LOST PROPERTY AND LOG', description: 'Check the lost-property drawer. Log any unclaimed items older than 30 days and escalate to the venue manager.', monthlyOption: 'FIRST_DAY' },
    { title: 'REVIEW AND UPDATE RESERVATION SYSTEM', description: 'Audit the next 6 weeks of reservations for double-bookings or gaps. Update table-allocation notes in the system.', monthlyOption: 'LAST_DAY' },
  ]

  for (let i = 0; i < fohMonthlyTasks.length; i++) {
    const { monthlyOption, ...task } = fohMonthlyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0007${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0007${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
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

  // WHOLE-VENUE DAILY (3 tasks)
  const venueDailyTasks = [
    { title: 'CHECK ALL FIRE EXITS ARE CLEAR', description: 'Walk every fire exit — ensure the path is unobstructed and the door opens freely from inside.', type: CompletionType.TICK },
    { title: 'TEST FIRE ALARM PANEL INDICATOR', description: 'Confirm the panel shows a green ready light. Note any amber or red warnings in the log for the manager.', type: CompletionType.TICK_NOTE },
    { title: 'INSPECT STAFF ROOM CLEANLINESS', description: 'Check the staff break area — clear rubbish, wipe tables, restock tea/coffee station if needed.', type: CompletionType.TICK },
  ]

  for (let i = 0; i < venueDailyTasks.length; i++) {
    const { type, ...task } = venueDailyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0008${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0008${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: null,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // WHOLE-VENUE WEEKLY (2 tasks)
  const venueWeeklyTasks = [
    { title: 'TEST EMERGENCY LIGHTING SYSTEM', description: 'Kill the main lighting circuit and confirm all emergency exit lights illuminate for at least 30 seconds. Record test in log.', days: [1] },
    { title: 'CHECK FIRST-AID KIT CONTENTS', description: 'Open every first-aid kit on site. Restock any used items. Check expiry dates on sterile dressings. Sign the inspection card.', days: [1] },
  ]

  for (let i = 0; i < venueWeeklyTasks.length; i++) {
    const { days, ...task } = venueWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: d(`0009${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0009${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: null,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: venueDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // ─── Food Health & Safety READING tasks (Compliance hub) ─────────────
  // Reading checks with NZ GFMP pass bands + critical danger bands. Linked to
  // inventory equipment items when they exist (the FRIDGE/FREEZER units are
  // equipment items — link by name match, best-effort).
  const hsEquipmentItems = await prisma.inventoryItem.findMany({
    where: { venueId: demoVenue.id, deletedAt: null },
    select: { id: true, name: true, storageType: true },
  })
  const eq = (name: string) => {
    const hit = hsEquipmentItems.find((i) => i.name.toUpperCase().includes(name))
    return hit ? hit.id : null
  }
  const fridge1Id = eq('FRIDGE') ?? null
  const freezer1Id = eq('FREEZER') ?? null
  const probeId = eq('THERMOMETER') ?? eq('PROBE') ?? null

  const hsReadingTasks = [
    {
      title: 'FRIDGE 1 — WALK-IN TEMP', description: 'Record the walk-in fridge temperature. Alert the manager if outside 0–5°C.',
      category: HsCategory.EQUIPMENT, linkedItemId: fridge1Id,
      readingUnit: '°C', readingMin: 0, readingMax: 5, criticalMax: 10,
      schedule: { scheduleType: ScheduleType.DAILY, scheduleDays: [] },
    },
    {
      title: 'FREEZER 1 — WALK-IN TEMP', description: 'Record the walk-in freezer temperature. Alert the manager if above -18°C.',
      category: HsCategory.EQUIPMENT, linkedItemId: freezer1Id,
      readingUnit: '°C', readingMin: -25, readingMax: -18, criticalMin: -30, criticalMax: -12,
      schedule: { scheduleType: ScheduleType.DAILY, scheduleDays: [] },
    },
    {
      title: 'PROBE THERMOMETER CALIBRATION', description: 'Test the probe against the ice-water method — must read 0°C ± 1°C.',
      category: HsCategory.EQUIPMENT, linkedItemId: probeId,
      readingUnit: '°C', readingMin: -1, readingMax: 1, criticalMin: -2, criticalMax: 2,
      schedule: { scheduleType: ScheduleType.WEEKLY, scheduleDays: [3] },
    },
    {
      title: 'HOT HOLD — BAIN MARIE', description: 'Record the bain-marie temperature — hot food must hold at 60°C or above.',
      category: HsCategory.FOOD, linkedItemId: null,
      readingUnit: '°C', readingMin: 60,
      schedule: { scheduleType: ScheduleType.DAILY, scheduleDays: [] },
    },
    {
      title: 'COOLING — STOCK POT', description: 'Cooling must move 60°C → 20°C within 2 hours. Record the temperature after the first hour.',
      category: HsCategory.FOOD, linkedItemId: null,
      readingUnit: '°C', readingMax: 40, criticalMax: 50,
      schedule: { scheduleType: ScheduleType.WEEKLY, scheduleDays: [0] },
    },
    {
      title: 'PEST TRAP INSPECTION', description: 'Check every pest trap — record bait state and any activity. Any sightings are a CRITICAL alert.',
      category: HsCategory.FACILITY, linkedItemId: null,
      type: CompletionType.TICK,
      schedule: { scheduleType: ScheduleType.MONTHLY, scheduleDays: [], monthlyOption: 'FIRST_DAY', intervalMonths: 1 },
    },
  ]

  for (let i = 0; i < hsReadingTasks.length; i++) {
    const { category, linkedItemId, schedule, type, ...task } = hsReadingTasks[i]
    await prisma.task.upsert({
      where: { id: d(`000a${String(i).padStart(8, '0')}`) },
      update: {},
      create: {
        id: d(`000a${String(i).padStart(8, '0')}`),
        ...task,
        venueId: demoVenue.id,
        departmentId: deptBOH.id,
        hsCategory: category,
        linkedItemId,
        completionType: type ?? CompletionType.READING,
        ...schedule,
        intervalMonths: schedule.intervalMonths ?? 1,
        monthlyOption: schedule.monthlyOption ?? null,
        sortOrder: i,
        isActive: true,
      },
    })
  }

  // ─── Demo delivery (Compliance hub DELIVERIES tab) ───────────────────
  // Tag any existing demo food items with storage rules (harmless no-op when
  // no items exist — the demo venue's inventory is built by other scripts).
  await prisma.inventoryItem.updateMany({
    where: { venueId: demoVenue.id, deletedAt: null, OR: [{ name: { contains: 'MILK' } }, { name: { contains: 'CREAM' } }, { name: { contains: 'YOGHURT' } }, { name: { contains: 'BUTTER' } }] },
    data: { storageType: StorageType.CHILLED },
  })
  await prisma.inventoryItem.updateMany({
    where: { venueId: demoVenue.id, deletedAt: null, OR: [{ name: { contains: 'FRIES' } }, { name: { contains: 'ICE CREAM' } }, { name: { contains: 'CHICKEN' } }] },
    data: { storageType: StorageType.FROZEN },
  })

  const demoSupplier = await prisma.supplier.findFirst({
    where: { venueId: demoVenue.id, deletedAt: null },
    select: { id: true, name: true },
  })
  if (demoSupplier) {
    const anyItems = await prisma.inventoryItem.findMany({
      where: { venueId: demoVenue.id, deletedAt: null },
      select: { id: true, name: true, unit: true, storageType: true },
      take: 3,
    })
    if (anyItems.length > 0) {
      await prisma.delivery.upsert({
        where: { id: d('000b00000001') },
        update: {},
        create: {
          id: d('000b00000001'),
          venueId: demoVenue.id,
          supplierId: demoSupplier.id,
          supplierName: demoSupplier.name,
          deliveredAt: new Date(),
          vehicleTemp: 4.5,
          vehicleVerdict: 'PASS',
          invoiceRef: 'DEMO-1001',
          notes: 'SEEDED DEMO DELIVERY — RECORDED BY THE SEED SCRIPT.',
          receivedById: d('000000000030'),
          items: {
            create: anyItems.map((item, idx) => {
              const storageType = item.storageType === StorageType.CHILLED || item.storageType === StorageType.FROZEN
                ? item.storageType
                : StorageType.CHILLED
              return {
                inventoryItemId: item.id,
                itemName: item.name,
                storageType,
                qty: 5,
                unit: item.unit,
                temp: idx === 0 ? 4.2 : 6.1, // first line passes, second fails (6.1 > 5)
                verdict: idx === 0 ? 'PASS' : 'FAIL',
                disposition: idx === 0 ? 'ACCEPTED' : 'REJECTED',
              }
            }),
          },
        },
      })
    }
  }

  // ONE-OFF / SIDE-WORK TASKS (4 tasks — test rollover)
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
      where: { id: d(`0004${String(i).padStart(12, '0')}`) },
      update: {},
      create: {
        id: d(`0004${String(i).padStart(12, '0')}`),
        ...task,
        venueId: demoVenue.id,
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

  // ─── Phase 6: Demo checklists ────────────────────────────────────────

  async function upsertChecklist(id: string, name: string, desc: string | null, deptId: string | null, appearFrom: string | null, taskIds: string[]) {
    await prisma.checklist.upsert({
      where: { id },
      update: { name, description: desc, departmentId: deptId, appearFromTime: appearFrom },
      create: { id, name, description: desc, venueId: demoVenue.id, departmentId: deptId, appearFromTime: appearFrom },
    })
    await prisma.checklistTask.deleteMany({ where: { checklistId: id } })
    await prisma.checklistTask.createMany({
      data: taskIds.map((taskId, i) => ({ checklistId: id, taskId, sortOrder: i })),
    })
  }

  const bohDailyIds = bohDailyTasks.map((_, i) => d(`0001${String(i).padStart(12, '0')}`))
  const bohWeeklyIds = bohWeeklyTasks.map((_, i) => d(`0002${String(i).padStart(12, '0')}`))
  const fohDailyIds = fohDailyTasks.map((_, i) => d(`0005${String(i).padStart(12, '0')}`))
  const fohWeeklyIds = fohWeeklyTasks.map((_, i) => d(`0006${String(i).padStart(12, '0')}`))
  const venueDailyIds = venueDailyTasks.map((_, i) => d(`0008${String(i).padStart(12, '0')}`))
  const venueWeeklyIds = venueWeeklyTasks.map((_, i) => d(`0009${String(i).padStart(12, '0')}`))
  const bohMonthlyIds = bohMonthlyTasks.map((_, i) => d(`0003${String(i).padStart(12, '0')}`))
  const fohMonthlyIds = fohMonthlyTasks.map((_, i) => d(`0007${String(i).padStart(12, '0')}`))
  const oneOffIds = oneOffTasks.map((_, i) => d(`0004${String(i).padStart(12, '0')}`))

  await upsertChecklist(
    d('00c0000000000001'),
    'BOH OPEN',
    'Morning opening routine for the kitchen.',
    deptBOH.id,
    '07:00',
    [...bohDailyIds.slice(0, 5), bohDailyIds[5], bohDailyIds[7]]
  )

  await upsertChecklist(
    d('00c0000000000002'),
    'BOH CLOSE',
    'End-of-shift close down.',
    deptBOH.id,
    '16:00',
    [bohDailyIds[2], bohDailyIds[4], bohDailyIds[6]]
  )

  await upsertChecklist(
    d('00c0000000000003'),
    'BOH WEEKLY CLEAN',
    'Monday morning deep-clean routine.',
    deptBOH.id,
    '08:00',
    [...bohWeeklyIds, ...bohMonthlyIds.slice(0, 2)]
  )

  await upsertChecklist(
    d('00c0000000000004'),
    'FOH OPEN',
    'Morning opening routine for front of house.',
    deptFOH.id,
    '09:00',
    [...fohDailyIds.slice(0, 5), fohDailyIds[6], fohDailyIds[7]]
  )

  await upsertChecklist(
    d('00c0000000000005'),
    'FOH CLOSE',
    'End-of-shift close down for the floor.',
    deptFOH.id,
    '17:00',
    [fohDailyIds[0], fohDailyIds[3], fohDailyIds[5]]
  )

  await upsertChecklist(
    d('00c0000000000006'),
    'FOH WEEKLY ROUTINE',
    'Mid-week maintenance tasks.',
    deptFOH.id,
    '10:00',
    fohWeeklyIds
  )

  await upsertChecklist(
    d('00c0000000000007'),
    'SIDE WORK',
    'Ad-hoc and one-off tasks from the team. Any department can pick these up.',
    null,
    null,
    [...oneOffIds, bohDailyIds[6], fohDailyIds[5]]
  )

  await upsertChecklist(
    d('00c0000000000008'),
    'WHOLE VENUE',
    'Safety and facility tasks for everyone.',
    null,
    null,
    [...venueDailyIds, ...venueWeeklyIds]
  )

  // QR Codes
  await prisma.qRCode.upsert({
    where: { id: d('000000000031') },
    update: {},
    create: { id: d('000000000031'), venueId: demoVenue.id, label: 'BOH ENTRY QR', isActive: true },
  })

  await prisma.qRCode.upsert({
    where: { id: d('000000000032') },
    update: {},
    create: { id: d('000000000032'), venueId: demoVenue.id, label: 'FOH ENTRY QR', isActive: true },
  })

  // ─── Phase 7: Built-in task templates ────────────────────────────────
  const builtInTemplates = [
    {
      id: d('00a0000000000001'),
      name: 'BOH OPEN',
      description: 'Opening checklist for back of house.',
      category: 'BOH',
      items: [
        { title: 'RECORD ALL FRIDGE AND FREEZER TEMPERATURES', completionType: 'TICK_NOTE' as const },
        { title: 'CHECK OIL LEVELS AND QUALITY IN FRYERS', completionType: 'TICK' as const },
        { title: 'SANITISE ALL PREP SURFACES', completionType: 'TICK' as const },
        { title: 'CHECK DELIVERIES AGAINST DOCKETS', completionType: 'TICK_NOTE' as const },
        { title: 'PREP MISE EN PLACE FOR SERVICE', completionType: 'TICK' as const },
      ],
    },
    {
      id: d('00a0000000000002'),
      name: 'BOH CLOSE',
      description: 'Closing checklist for back of house.',
      category: 'BOH',
      items: [
        { title: 'RECORD CLOSING FRIDGE TEMPERATURES', completionType: 'TICK_NOTE' as const },
        { title: 'CLEAN AND DEGREASE COOKLINE', completionType: 'TICK' as const },
        { title: 'EMPTY AND SANITISE BINS', completionType: 'TICK' as const },
        { title: 'WRAP, LABEL AND DATE ALL OPEN STOCK', completionType: 'TICK' as const },
        { title: 'PHOTO OF CLEAN BOH FOR HANDOVER', completionType: 'TICK_PHOTO' as const },
      ],
    },
    {
      id: d('00a0000000000003'),
      name: 'FOH OPEN',
      description: 'Opening checklist for front of house.',
      category: 'FRONT OF HOUSE',
      items: [
        { title: 'POLISH ALL CUTLERY AND GLASSWARE', completionType: 'TICK' as const },
        { title: 'SET ALL TABLES TO STANDARD LAYOUT', completionType: 'TICK' as const },
        { title: 'FILL CONDIMENT AND NAPKIN STATIONS', completionType: 'TICK' as const },
        { title: 'CHECK AND CLEAN CUSTOMER BATHROOMS', completionType: 'TICK_PHOTO' as const },
        { title: 'BRIEF FLOOR TEAM ON SPECIALS AND ALLERGENS', completionType: 'TICK_NOTE' as const },
      ],
    },
    {
      id: d('00a0000000000004'),
      name: 'FOH CLOSE',
      description: 'Closing checklist for front of house.',
      category: 'FRONT OF HOUSE',
      items: [
        { title: 'CLEAR, WIPE AND RESET ALL TABLES', completionType: 'TICK' as const },
        { title: 'STACK AND CHARGE EFTPOS TERMINALS', completionType: 'TICK' as const },
        { title: 'SWEEP AND MOP FLOOR', completionType: 'TICK' as const },
        { title: 'RESTOCK FOR NEXT SERVICE', completionType: 'TICK' as const },
      ],
    },
    {
      id: d('00a0000000000005'),
      name: 'WEEKLY DEEP CLEAN',
      description: 'Weekly deep-clean tasks (defaults to Monday).',
      category: 'GENERAL',
      items: [
        { title: 'DEEP CLEAN BEHIND ALL EQUIPMENT', completionType: 'TICK_PHOTO' as const, scheduleType: 'WEEKLY' as const, scheduleDays: [1] },
        { title: 'DESCALE SINKS AND TAPS', completionType: 'TICK' as const, scheduleType: 'WEEKLY' as const, scheduleDays: [1] },
        { title: 'FULL STOCKTAKE AND REORDER', completionType: 'TICK_NOTE' as const, scheduleType: 'WEEKLY' as const, scheduleDays: [1] },
      ],
    },
  ]

  for (const tpl of builtInTemplates) {
    await prisma.taskTemplate.upsert({
      where: { id: tpl.id },
      update: { name: tpl.name, description: tpl.description, category: tpl.category, isBuiltIn: true },
      create: { id: tpl.id, name: tpl.name, description: tpl.description, category: tpl.category, isBuiltIn: true, venueId: null },
    })
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

  // ─── Phase 8: Demo training modules ──────────────────────────────────
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
    {
      id: d('00b0000000000001'),
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
    {
      id: d('00b0000000000002'),
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
    {
      id: d('00b0000000000003'),
      title: 'FRYER SAFETY & OIL MANAGEMENT',
      description: 'How to safely check, change, and dispose of fryer oil. Linked to the daily fryer task. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · BOH ONLY]',
      category: 'BOH',
      kind: 'TRAINING',
      departmentId: deptBOH.id,
      linkedTaskId: d('0001000000000002'),
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
    {
      id: d('00b0000000000005'),
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
    {
      id: d('00b0000000000004'),
      title: 'FOH SERVICE STANDARDS',
      description: 'Table-setting, greeting, and service flow standards. [TRAINING · SELF-COMPLETE · ONBOARDING · FOH ONLY]',
      category: 'FOH',
      kind: 'TRAINING',
      departmentId: deptFOH.id,
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 3,
      steps: [
        { title: 'TABLE SETTINGS', content: "Cutlery 2cm from table edge. Wine glass at 1 o'clock, water at 11 o'clock. Napkin folded centre.", imageUrl: 'https://placehold.co/600x400/FACC15/0A0A0A?text=Place+Setting+Diagram' },
        { title: 'GREETING GUESTS', content: 'Welcome within 30 seconds of seating. Offer water immediately. Introduce yourself by name.' },
        { title: 'ALLERGEN AWARENESS', content: 'Always ask about allergies when taking orders. Mark dockets clearly. Confirm with kitchen before serving.' },
      ],
    },
    {
      id: d('00b0000000000006'),
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
        { title: 'TEMPERATURE CHECKS FIRST', content: 'Before anything else, record all fridge and freezer temperatures. Any unit outside 0-5°C (fridge) or below -18°C (freezer) must be reported immediately.', linkedChecklistId: d('00c0000000000001') },
        { title: 'MISE EN PLACE', content: 'Set up your station with everything you need for service. Check prep levels against the par sheet.', imageUrl: 'https://placehold.co/600x400/4ADE80/0A0A0A?text=Mise+En+Place+Setup' },
      ],
    },
    {
      id: d('00b0000000000007'),
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
        { title: 'CLEAR AND RESET', content: "Clear all tables, wipe down, and reset to the standard layout for tomorrow's service. Stack chairs on tables in the area being mopped.", linkedChecklistId: d('00c0000000000005') },
        { title: 'EFTPOS AND TILL', content: 'Close out all terminals. Print the end-of-day report. Count the float and lock it in the safe. Both a manager and the closing staff member must sign the cash-up sheet.' },
      ],
    },
    {
      id: d('00b0000000000008'),
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
    {
      id: d('00b0000000000009'),
      title: 'HOW TO READ THE FRIDGE TEMP LOG',
      description: 'Step-by-step guide to the daily temperature recording sheet. Linked to the fridge temp task. [HOWTO · SELF-COMPLETE · BOH ONLY]',
      category: 'BOH',
      kind: 'HOWTO',
      departmentId: deptBOH.id,
      linkedTaskId: d('0001000000000000'),
      requiresSignOff: false,
      isOnboarding: true,
      onboardingOrder: 7,
      steps: [
        { title: 'FIND THE LOG SHEET', content: 'The temperature log clipboard hangs on the cool-room door. Each fridge and freezer has its own column.' },
        { title: 'RECORDING', content: "Write the actual temperature reading from the unit's display. Do NOT write the target temperature. If the reading is outside range, circle it in RED." },
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
        venueId: demoVenue.id,
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

  // ── Phase 8b: Demo playbook guides ──────────────────────────────────────
  // Guides are the current training system (the legacy TrainingModule rows
  // above no longer surface anywhere — the migration that converts them skips
  // once any guide exists). These rows ARE the demo venue's playbook: rich
  // step-by-step guides, all PUBLISHED, with step links and audiences so every
  // playbook feature has a live example.
  //
  // On old installs the migrate-to-guides script minted DRAFT guides from the
  // demo's own legacy modules (reusing the 00b0 ids). They duplicate this
  // content, so they are cleaned up here — demo-origin rows only, never a real
  // venue's guides.
  await prisma.guide.updateMany({
    where: { venueId: demoVenue.id, id: { startsWith: '00000000-0000-0000-00d0-00b0' } },
    data: { deletedAt: new Date() },
  })

  const GUIDE_IDS = {
    welcome: d('00d100000001'),
    foodSafety: d('00d100000002'),
    fryer: d('00d100000003'),
    chemicals: d('00d100000004'),
    fohService: d('00d100000005'),
    allergens: d('00d100000006'),
    bohOpen: d('00d100000007'),
    tempLog: d('00d100000008'),
    fohClose: d('00d100000009'),
  }

  interface DemoStep {
    heading: string
    content: string
    imageUrl?: string
    videoUrl?: string
    links?: { kind: 'TASK' | 'CHECKLIST' | 'GUIDE'; targetId: string; note?: string }[]
  }

  interface DemoGuide {
    id: string
    title: string
    description: string
    category: string
    departmentId: string | null
    requiresSignOff: boolean
    isOnboarding: boolean
    steps: DemoStep[]
  }

  const demoGuides: DemoGuide[] = [
    {
      id: GUIDE_IDS.welcome,
      title: 'WELCOME & VENUE INDUCTION',
      description: 'Everything a new hire needs on day one — the venue, the team, the house rules, and the first shift. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · WHOLE VENUE]',
      category: 'INDUCTION',
      departmentId: null,
      requiresSignOff: true,
      isOnboarding: true,
      steps: [
        {
          heading: 'WELCOME TO THE TEAM',
          content: "Welcome aboard! This induction covers the venue basics — who's who, how the floor runs, and the house rules everyone works by. Read every step, then ask a manager to sign you off at the end.",
          imageUrl: 'https://placehold.co/600x400/F97316/0A0A0A?text=Welcome+To+The+Team',
        },
        { heading: "WHO'S WHO", content: 'The venue manager runs the site. Department managers run their own areas — ask the kitchen manager anything food-related, the floor manager anything guest-related. Duty managers are the shift authority: they sign off cash-ups, incidents, and this induction.' },
        { heading: 'THE FIRST SHIFT', content: "Arrive 10 minutes early, clock in, and read the day's task list. If a task is due you'll see it on your phone — tick it when it's done. Anything marked with a camera icon needs a photo as proof.", links: [{ kind: 'CHECKLIST', targetId: d('00c0000000000008'), note: 'THE WHOLE VENUE LIST IS THE FIRST THING EVERYONE TICKS' }] },
        { heading: 'SIGN-OFF', content: 'When you have read all four steps, tell the duty manager. They will walk you through the venue and sign off this guide from the Staff page — until then it stays pending on your record.' },
      ],
    },
    {
      id: GUIDE_IDS.foodSafety,
      title: 'FOOD SAFETY BASICS',
      description: 'The non-negotiables: personal hygiene, the danger zone, and cross-contamination. Required before any kitchen task. [TRAINING · SIGN-OFF REQUIRED · ONBOARDING · BOH ONLY]',
      category: 'FOOD SAFETY',
      departmentId: deptBOH.id,
      requiresSignOff: true,
      isOnboarding: false,
      steps: [
        { heading: 'PERSONAL HYGIENE', content: 'Wash hands for 20 seconds before starting and after handling raw food, bins, or money. No jewellery on hands, hair tied back, clean uniform every shift. Any cuts covered with a blue plaster.' },
        { heading: 'THE DANGER ZONE', content: 'Food between 5°C and 60°C is in the danger zone — bacteria double every 20 minutes. Hot food stays above 60°C, cold food below 5°C. Never leave food out; if it has sat for 2 hours, it goes in the bin.' },
        { heading: 'CROSS-CONTAMINATION', content: 'Raw meat and ready-to-eat food never share a board, knife, or pair of tongs. Use the colour-coded boards — red for raw meat, white for ready-to-eat. Sanitise between tasks and after every spill.', links: [{ kind: 'TASK', targetId: bohDailyIds[0], note: 'THE FRIDGE TEMP CHECK IS THE FIRST JOB EVERY MORNING' }] },
        { heading: 'SIGN-OFF', content: 'The kitchen manager signs this guide off once you can name the danger zone temperatures and the four cross-contamination rules from memory.' },
      ],
    },
    {
      id: GUIDE_IDS.fryer,
      title: 'FRYER SAFETY & OIL MANAGEMENT',
      description: 'Safe operation of the deep fryers and the oil care routine that keeps them running. [TRAINING · SELF-COMPLETE · BOH ONLY]',
      category: 'EQUIPMENT',
      departmentId: deptBOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'LIGHTING THE FRYER', content: 'Check the oil level is between the MIN and MAX lines before lighting. Never leave a lit fryer unattended — if oil is smoking, turn it off and let it cool, do not add water.' },
        { heading: 'OIL LEVEL CHECKS', content: 'Check oil quality at the start of every shift: dark or foaming oil is past its best. Top up with fresh oil, and log the check in the daily task.', links: [{ kind: 'TASK', targetId: bohDailyIds[2], note: 'DAILY OIL CHECK — TICK ONCE DONE' }] },
        { heading: 'FILTERING & CHANGING OIL', content: 'Filter the oil at the end of each service. A full change is due weekly or when the oil smokes below 180°C. Cool completely, drain into the sealed waste container, and never pour oil down the sink.' },
      ],
    },
    {
      id: GUIDE_IDS.chemicals,
      title: 'CHEMICAL HANDLING & SAFETY',
      description: 'Reading labels, diluting correctly, and what to do when a chemical spills. [TRAINING · SELF-COMPLETE · BOH ONLY]',
      category: 'SAFETY',
      departmentId: deptBOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'DILUTION & LABELS', content: 'Every chemical has a dilution rate on the label — never guess. Always add chemical to water, never water to chemical. Undiluted chemicals live in the locked cupboard, never on a shelf above food.' },
        { heading: 'PERSONAL PROTECTION', content: 'Gloves and eye protection are beside the chemical cupboard. Wear them for anything labelled corrosive or irritant. Wash splashes off skin immediately with cold water.' },
        { heading: 'SPILL RESPONSE', content: 'Cordon off the spill, grab the spill kit, and follow the label instructions. Report any spill to the manager on duty — the monthly chemical audit keeps the stock log accurate.', links: [{ kind: 'TASK', targetId: bohMonthlyIds[1], note: 'MONTHLY CHEMICAL AUDIT' }] },
      ],
    },
    {
      id: GUIDE_IDS.fohService,
      title: 'FOH SERVICE STANDARDS',
      description: 'Table setting, greeting, order-taking, and allergen awareness — the floor service standard. [TRAINING · SELF-COMPLETE · ONBOARDING · FOH ONLY]',
      category: 'SERVICE',
      departmentId: deptFOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'TABLE SETTINGS', content: "Cutlery 2cm from the table edge. Wine glass at 1 o'clock, water at 11 o'clock. Napkin folded centre. Walk the floor before service and fix any table that is out of standard.", imageUrl: 'https://placehold.co/600x400/FACC15/0A0A0A?text=Place+Setting+Diagram' },
        { heading: 'GREETING GUESTS', content: 'Welcome guests within 30 seconds of seating. Offer water immediately, introduce yourself by name, and mention today\'s specials — the floor brief covers them every shift.', links: [{ kind: 'TASK', targetId: fohDailyIds[4], note: 'DAILY FLOOR BRIEF — ATTEND BEFORE SERVICE' }] },
        { heading: 'ALLERGEN AWARENESS', content: 'Always ask about allergies when taking orders. Mark dockets clearly and confirm with the kitchen before serving. If you are unsure, say so — never guess.' },
      ],
    },
    {
      id: GUIDE_IDS.allergens,
      title: 'COMMON ALLERGEN QUESTIONS',
      description: 'Quick reference for the most common dietary and allergen questions from guests. [FAQ · SELF-COMPLETE · ONBOARDING · WHOLE VENUE]',
      category: 'ALLERGENS',
      departmentId: null,
      requiresSignOff: false,
      isOnboarding: true,
      steps: [
        { heading: 'GLUTEN-FREE OPTIONS', content: 'All grilled proteins are GF. Any dish with the GF symbol can be made coeliac-safe. Always confirm with the kitchen and mark the docket CLEARLY.' },
        { heading: 'DAIRY-FREE', content: 'We use a plant-based butter alternative for dairy-free requests. Most sauces can be modified. The vegan dessert is always dairy-free.' },
        { heading: 'NUT ALLERGY', content: 'We use almond meal in two desserts and peanut oil in one fryer. All other fryers use canola. Check the allergen matrix above the pass before answering any nut question.' },
      ],
    },
    {
      id: GUIDE_IDS.bohOpen,
      title: 'BOH MORNING OPENING PROCEDURE',
      description: 'Standard operating procedure for kitchen open — follow the BOH OPEN checklist. [SOP · SELF-COMPLETE · BOH ONLY]',
      category: 'BOH',
      departmentId: deptBOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'ARRIVE AND CHECK IN', content: "Scan the BOH QR code at the kitchen entrance. Clock in and review today's task list." },
        { heading: 'TEMPERATURE CHECKS FIRST', content: 'Before anything else, record all fridge and freezer temperatures. Any unit outside 0-5°C (fridge) or below -18°C (freezer) must be reported immediately.', links: [{ kind: 'TASK', targetId: bohDailyIds[0], note: 'RECORD EVERY UNIT' }, { kind: 'CHECKLIST', targetId: d('00c0000000000001'), note: 'THEN WORK THE BOH OPEN LIST' }] },
        { heading: 'MISE EN PLACE', content: 'Set up your station with everything you need for service. Check prep levels against the par sheet.', imageUrl: 'https://placehold.co/600x400/4ADE80/0A0A0A?text=Mise+En+Place+Setup' },
      ],
    },
    {
      id: GUIDE_IDS.tempLog,
      title: 'HOW TO READ THE FRIDGE TEMP LOG',
      description: 'Step-by-step guide to the daily temperature recording sheet. Linked to the fridge temp task. [HOWTO · SELF-COMPLETE · BOH ONLY]',
      category: 'BOH',
      departmentId: deptBOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'FIND THE LOG SHEET', content: 'The temperature log clipboard hangs on the cool-room door. Each fridge and freezer has its own column.' },
        { heading: 'RECORDING', content: "Write the actual temperature reading from the unit's display. Do NOT write the target temperature. If the reading is outside range, circle it in RED.", links: [{ kind: 'TASK', targetId: bohDailyIds[0], note: 'LOG THE READING IN THE APP TOO' }] },
        { heading: 'SIGN AND DATE', content: 'Write your initials and the time in the STAFF column. If you circled any readings, notify the manager on duty immediately — do not wait until end of shift.' },
      ],
    },
    {
      id: GUIDE_IDS.fohClose,
      title: 'FOH END-OF-NIGHT CLOSE',
      description: 'Standard operating procedure for closing the floor. Linked to the FOH CLOSE checklist. [SOP · SELF-COMPLETE · FOH ONLY]',
      category: 'FOH',
      departmentId: deptFOH.id,
      requiresSignOff: false,
      isOnboarding: false,
      steps: [
        { heading: 'LAST GUEST LEAVES', content: 'Once the last guest has left, begin closing duties. Do not rush guests — let them finish naturally.' },
        { heading: 'CLEAR AND RESET', content: "Clear all tables, wipe down, and reset to the standard layout for tomorrow's service. Stack chairs on tables in the area being mopped.", links: [{ kind: 'CHECKLIST', targetId: d('00c0000000000005'), note: 'WORK THE FOH CLOSE LIST' }] },
        { heading: 'EFTPOS AND TILL', content: 'Close out all terminals. Print the end-of-day report. Count the float and lock it in the safe. Both a manager and the closing staff member must sign the cash-up sheet.' },
      ],
    },
  ]

  for (const g of demoGuides) {
    await prisma.guide.upsert({
      where: { id: g.id },
      update: {
        title: g.title,
        description: g.description,
        category: g.category,
        departmentId: g.departmentId ?? null,
        status: 'PUBLISHED',
        isTracked: true,
        isOnboarding: g.isOnboarding,
        requiresSignOff: g.requiresSignOff,
      },
      create: {
        id: g.id,
        title: g.title,
        description: g.description,
        category: g.category,
        venueId: demoVenue.id,
        departmentId: g.departmentId ?? null,
        status: 'PUBLISHED',
        isTracked: true,
        isOnboarding: g.isOnboarding,
        requiresSignOff: g.requiresSignOff,
      },
    })

    await prisma.guideStep.deleteMany({ where: { guideId: g.id } })
    await prisma.guideStep.createMany({
      data: g.steps.map((s, i) => ({
        guideId: g.id,
        order: i,
        heading: s.heading,
        content: s.content,
        imageUrl: s.imageUrl ?? null,
        videoUrl: s.videoUrl ?? null,
      })),
    })

    const createdSteps = await prisma.guideStep.findMany({
      where: { guideId: g.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    })
    const linkRows = g.steps.flatMap((s, si) =>
      (s.links ?? []).map((l, li) => ({
        stepId: createdSteps[si].id,
        kind: l.kind,
        targetId: l.targetId,
        note: l.note ?? null,
        order: li,
      })),
    )
    if (linkRows.length) await prisma.guideStepLink.createMany({ data: linkRows })

    await prisma.guideAudience.deleteMany({ where: { guideId: g.id } })
    if (g.departmentId) {
      await prisma.guideAudience.create({
        data: { guideId: g.id, kind: 'DEPARTMENT', targetId: g.departmentId },
      })
    }
  }

  // Competency links: completing FOOD SAFETY BASICS is required before the
  // fridge-temperature task counts.
  await prisma.taskGuide.upsert({
    where: { taskId_guideId: { taskId: bohDailyIds[0], guideId: GUIDE_IDS.foodSafety } },
    update: { isRequiredForCompetency: true },
    create: { taskId: bohDailyIds[0], guideId: GUIDE_IDS.foodSafety, isRequiredForCompetency: true },
  })

  // ── Phase 8c: Demo pathways ────────────────────────────────────────────
  // Two authored onboarding trees — one per department — with stages,
  // unlock chains and a milestone each. Published, so workers see them.

  interface DemoNode {
    id: string
    kind: 'GUIDE' | 'TASK' | 'CHECKLIST' | 'MILESTONE'
    targetId: string | null
    label: string | null
    x: number
    y: number
    stage: number
    points: number
  }

  const PW_FOH: { id: string; name: string; nodes: DemoNode[]; edges: { fromNodeId: string; toNodeId: string }[] } = {
    id: d('00d200000001'),
    name: 'FOH ONBOARDING',
    nodes: [
      { id: d('00d300000001'), kind: 'GUIDE', targetId: GUIDE_IDS.welcome, label: null, x: 60, y: 60, stage: 0, points: 10 },
      { id: d('00d300000002'), kind: 'GUIDE', targetId: GUIDE_IDS.fohService, label: null, x: 60, y: 170, stage: 0, points: 15 },
      { id: d('00d300000003'), kind: 'GUIDE', targetId: GUIDE_IDS.allergens, label: null, x: 60, y: 280, stage: 0, points: 10 },
      { id: d('00d300000004'), kind: 'TASK', targetId: fohDailyIds[4], label: null, x: 320, y: 60, stage: 1, points: 10 },
      { id: d('00d300000005'), kind: 'CHECKLIST', targetId: d('00c0000000000004'), label: null, x: 320, y: 170, stage: 1, points: 15 },
      { id: d('00d300000006'), kind: 'GUIDE', targetId: GUIDE_IDS.fohClose, label: null, x: 320, y: 280, stage: 1, points: 10 },
      { id: d('00d300000007'), kind: 'MILESTONE', targetId: null, label: 'FLOOR READY', x: 580, y: 170, stage: 2, points: 50 },
    ],
    edges: [
      { fromNodeId: d('00d300000001'), toNodeId: d('00d300000002') },
      { fromNodeId: d('00d300000001'), toNodeId: d('00d300000003') },
      { fromNodeId: d('00d300000002'), toNodeId: d('00d300000004') },
      { fromNodeId: d('00d300000003'), toNodeId: d('00d300000005') },
      { fromNodeId: d('00d300000004'), toNodeId: d('00d300000006') },
      { fromNodeId: d('00d300000005'), toNodeId: d('00d300000007') },
      { fromNodeId: d('00d300000006'), toNodeId: d('00d300000007') },
      { fromNodeId: d('00d300000004'), toNodeId: d('00d300000007') },
    ],
  }

  const PW_BOH: { id: string; name: string; nodes: DemoNode[]; edges: { fromNodeId: string; toNodeId: string }[] } = {
    id: d('00d200000002'),
    name: 'BOH ONBOARDING',
    nodes: [
      { id: d('00d300000008'), kind: 'GUIDE', targetId: GUIDE_IDS.foodSafety, label: null, x: 60, y: 60, stage: 0, points: 15 },
      { id: d('00d300000009'), kind: 'GUIDE', targetId: GUIDE_IDS.bohOpen, label: null, x: 60, y: 170, stage: 0, points: 10 },
      { id: d('00d300000010'), kind: 'GUIDE', targetId: GUIDE_IDS.chemicals, label: null, x: 60, y: 280, stage: 0, points: 10 },
      { id: d('00d300000011'), kind: 'GUIDE', targetId: GUIDE_IDS.fryer, label: null, x: 60, y: 390, stage: 0, points: 10 },
      { id: d('00d300000012'), kind: 'TASK', targetId: bohDailyIds[0], label: null, x: 320, y: 60, stage: 1, points: 10 },
      { id: d('00d300000013'), kind: 'GUIDE', targetId: GUIDE_IDS.tempLog, label: null, x: 320, y: 170, stage: 1, points: 10 },
      { id: d('00d300000014'), kind: 'CHECKLIST', targetId: d('00c0000000000001'), label: null, x: 580, y: 60, stage: 2, points: 15 },
      { id: d('00d300000015'), kind: 'MILESTONE', targetId: null, label: 'KITCHEN READY', x: 580, y: 170, stage: 2, points: 50 },
    ],
    edges: [
      { fromNodeId: d('00d300000008'), toNodeId: d('00d300000012') },
      { fromNodeId: d('00d300000009'), toNodeId: d('00d300000012') },
      { fromNodeId: d('00d300000012'), toNodeId: d('00d300000013') },
      { fromNodeId: d('00d300000010'), toNodeId: d('00d300000014') },
      { fromNodeId: d('00d300000011'), toNodeId: d('00d300000014') },
      { fromNodeId: d('00d300000013'), toNodeId: d('00d300000014') },
      { fromNodeId: d('00d300000014'), toNodeId: d('00d300000015') },
    ],
  }

  for (const pw of [PW_FOH, PW_BOH]) {
    await prisma.pathway.upsert({
      where: { id: pw.id },
      update: { name: pw.name, description: null, status: 'PUBLISHED' },
      create: {
        id: pw.id,
        name: pw.name,
        description: null,
        venueId: demoVenue.id,
        departmentId: pw.id === PW_FOH.id ? deptFOH.id : deptBOH.id,
        status: 'PUBLISHED',
      },
    })
    await prisma.pathwayNode.deleteMany({ where: { pathwayId: pw.id } })
    await prisma.pathwayNode.createMany({
      data: pw.nodes.map((n, i) => ({
        id: n.id,
        pathwayId: pw.id,
        kind: n.kind,
        targetId: n.targetId,
        label: n.label,
        x: n.x,
        y: n.y,
        stage: n.stage,
        points: n.points,
        sortOrder: i,
      })),
    })
    await prisma.pathwayEdge.deleteMany({ where: { pathwayId: pw.id } })
    await prisma.pathwayEdge.createMany({
      data: pw.edges.map((e) => ({ pathwayId: pw.id, ...e })),
    })
  }

  // Demo completions + assignments so the worker tree shows real progress.
  const guideCompletions: { guideId: string; staffId: string }[] = [
    { guideId: GUIDE_IDS.foodSafety, staffId: staffBoh1.id },
    { guideId: GUIDE_IDS.fryer, staffId: staffBoh1.id },
    { guideId: GUIDE_IDS.tempLog, staffId: staffBoh2.id },
    { guideId: GUIDE_IDS.welcome, staffId: staffFoh1.id },
    { guideId: GUIDE_IDS.fohService, staffId: staffFoh1.id },
    { guideId: GUIDE_IDS.allergens, staffId: staffFoh1.id },
    { guideId: GUIDE_IDS.welcome, staffId: staffFoh2.id },
  ]
  for (const c of guideCompletions) {
    await prisma.guideCompletion.upsert({
      where: { guideId_staffId: { guideId: c.guideId, staffId: c.staffId } },
      update: {},
      create: { guideId: c.guideId, staffId: c.staffId, selfCompleted: true },
    })
  }

  const guideAssignments: { guideId: string; staffId: string; reason: string }[] = [
    { guideId: GUIDE_IDS.tempLog, staffId: staffBoh1.id, reason: 'ONBOARDING' },
    { guideId: GUIDE_IDS.chemicals, staffId: staffBoh2.id, reason: 'AREA TO WORK ON' },
    { guideId: GUIDE_IDS.fohClose, staffId: staffFoh2.id, reason: 'UPSKILL' },
  ]
  for (const a of guideAssignments) {
    await prisma.guideAssignment.upsert({
      where: { guideId_staffId: { guideId: a.guideId, staffId: a.staffId } },
      update: { reason: a.reason },
      create: { guideId: a.guideId, staffId: a.staffId, reason: a.reason },
    })
  }

  // ─── Phase 9: Training assignments ──────────────────────────────────
  await prisma.trainingAssignment.deleteMany({ where: { moduleId: { in: trainingModules.map((m) => m.id) } } })
  await prisma.trainingAssignment.createMany({
    data: [
      { staffId: staffBoh1.id, moduleId: d('00b0000000000003'), reason: 'UPSKILL' },
      { staffId: staffBoh1.id, moduleId: d('00b0000000000005'), reason: 'AREA TO WORK ON' },
      { staffId: staffBoh2.id, moduleId: d('00b0000000000009'), reason: 'AREA TO WORK ON' },
      { staffId: staffFoh1.id, moduleId: d('00b0000000000007'), reason: 'UPSKILL' },
      { staffId: staffFoh2.id, moduleId: d('00b0000000000004'), reason: 'ONBOARDING' },
    ],
  })

  // ─── Phase 10: NZ statutory public holidays (national defaults) ─────
  // venueId null = national default. Regional anniversary days are left to
  // each venue to add (Settings-less: Payroll → PUBLIC HOLIDAYS).
  const nationalHolidays: { date: string; name: string }[] = [
    { date: '2026-01-01', name: 'NEW YEAR\'S DAY' },
    { date: '2026-01-02', name: 'DAY AFTER NEW YEAR\'S DAY' },
    { date: '2026-02-06', name: 'WAITANGI DAY' },
    { date: '2026-04-03', name: 'GOOD FRIDAY' },
    { date: '2026-04-06', name: 'EASTER MONDAY' },
    { date: '2026-04-25', name: 'ANZAC DAY' },
    { date: '2026-06-01', name: 'QUEEN\'S BIRTHDAY' },
    { date: '2026-10-26', name: 'LABOUR DAY' },
    { date: '2026-12-25', name: 'CHRISTMAS DAY' },
    { date: '2026-12-28', name: 'BOXING DAY (OBSERVED)' },
    { date: '2027-01-01', name: 'NEW YEAR\'S DAY' },
    { date: '2027-01-04', name: 'DAY AFTER NEW YEAR\'S DAY (OBSERVED)' },
    { date: '2027-02-08', name: 'WAITANGI DAY (OBSERVED)' },
    { date: '2027-03-26', name: 'GOOD FRIDAY' },
    { date: '2027-03-29', name: 'EASTER MONDAY' },
    { date: '2027-04-25', name: 'ANZAC DAY' },
    { date: '2027-06-07', name: 'KING\'S BIRTHDAY' },
    { date: '2027-10-25', name: 'LABOUR DAY' },
    { date: '2027-12-25', name: 'CHRISTMAS DAY' },
    { date: '2027-12-27', name: 'BOXING DAY (OBSERVED)' },
  ]
  for (const h of nationalHolidays) {
    const date = new Date(`${h.date}T00:00:00Z`)
    // No upsert here: the @@unique([venueId, date]) compound key can't be
    // matched with venueId = null in Prisma 7 ("Argument venueId must not be
    // null"), so match by row instead. Soft-deleted rows match the unique
    // key, so re-seeding refreshes them in place — same as upsert.
    const existing = await prisma.publicHoliday.findFirst({
      where: { venueId: null, date },
      select: { id: true },
    })
    if (existing) {
      await prisma.publicHoliday.update({ where: { id: existing.id }, data: { name: h.name } })
    } else {
      await prisma.publicHoliday.create({ data: { venueId: null, date, name: h.name } })
    }
  }

  console.log('Seed complete.')
  console.log(`Demo venue: ${demoVenue.name} [isDemo=${demoVenue.isDemo}, isActive=${demoVenue.isActive}]`)
  console.log('')
  console.log('Admin/manager web logins (email / password):')
  console.log('  admin@demo.com / admin1234    (ADMIN)')
  console.log('  boh@demo.com   / boh1234      (BOH MANAGER — demo venue)')
  console.log('  foh@demo.com   / foh1234      (FOH MANAGER — demo venue)')
  console.log('  hs@demo.com    / hs1234       (H&S OFFICER — RESTRICTED manager, compliance-only)')
  console.log('')
  console.log('Staff PIN logins (demo venue):')
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
  console.log(`  CHECKLISTS: 8`)
  console.log(`  TRAINING: ${trainingModules.length} modules with 5 individual assignments`)
  console.log(`  GUIDES: ${demoGuides.length} published playbook guides with steps + step links`)
  console.log(`  PATHWAYS: 2 published (FOH ONBOARDING ${PW_FOH.nodes.length} nodes, BOH ONBOARDING ${PW_BOH.nodes.length} nodes)`)
  console.log(`  GUIDE COMPLETIONS: ${guideCompletions.length} · ASSIGNMENTS: ${guideAssignments.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
