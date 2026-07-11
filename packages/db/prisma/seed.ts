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

  // BOH tasks
  const bohDailyTasks = [
    { title: 'CHECK FRIDGE TEMPERATURES', description: 'Record all fridge and freezer temperatures in log', type: CompletionType.TICK_NOTE },
    { title: 'SANITISE ALL PREP SURFACES', description: 'Clean and sanitise all cutting boards and prep benches', type: CompletionType.TICK },
    { title: 'CHECK OIL LEVELS IN FRYERS', description: 'Inspect oil quality and refill or change as needed', type: CompletionType.TICK },
    { title: 'RESTOCK DRY STORE', description: 'Rotate stock, bring forward older items, note shortages', type: CompletionType.TICK_NOTE },
    { title: 'EMPTY AND CLEAN BIN AREA', description: 'Empty all bins, wash bin area, replace liners', type: CompletionType.TICK_PHOTO },
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

  const bohWeeklyTasks = [
    { title: 'CLEAN BEHIND ALL EQUIPMENT', description: 'Pull out ovens, fryers, and fridges to clean underneath and behind', days: [1] },
    { title: 'CALIBRATE THERMOMETERS', description: 'Test and calibrate all probe thermometers against reference', days: [3] },
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

  // FOH tasks
  const fohDailyTasks = [
    { title: 'POLISH ALL CUTLERY AND GLASSWARE', description: 'Ensure no water spots or smudges on all service items', type: CompletionType.TICK },
    { title: 'CHECK AND FILL CONDIMENT STATIONS', description: 'Salt, pepper, sauces, napkins all fully stocked', type: CompletionType.TICK },
    { title: 'INSPECT ALL TABLE SETTINGS', description: 'All tables set correctly per standard layout', type: CompletionType.TICK },
    { title: 'CHECK TOILET CLEANLINESS', description: 'Inspect and clean all customer bathrooms', type: CompletionType.TICK_PHOTO },
    { title: 'BRIEF FLOOR TEAM ON SPECIALS', description: 'Ensure all floor staff know todays specials and allergens', type: CompletionType.TICK_NOTE },
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

  const fohWeeklyTasks = [
    { title: 'CLEAN ALL MENU HOLDERS AND MENUS', description: 'Wipe down and inspect all physical menus, replace damaged ones', days: [1] },
    { title: 'CHECK AND REORDER SUPPLIES', description: 'Count napkins, straws, and other consumables, raise order if needed', days: [4] },
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

  // QR Codes
  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      venueId: venue.id,
      label: 'BOH ENTRY QR',
      isActive: true,
    },
  })

  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000032',
      venueId: venue.id,
      label: 'FOH ENTRY QR',
      isActive: true,
    },
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
    steps: { title?: string; content: string; videoUrl?: string }[]
  }[] = [
    {
      id: '00000000-0000-0000-00b0-000000000001',
      title: 'WELCOME & VENUE INDUCTION',
      description: 'Start here on your first shift.',
      category: 'ONBOARDING',
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
      id: '00000000-0000-0000-00b0-000000000002',
      title: 'FOOD SAFETY BASICS',
      description: 'Core hygiene and food-handling rules.',
      category: 'FOOD SAFETY',
      requiresSignOff: true,
      isOnboarding: true,
      onboardingOrder: 2,
      steps: [
        { title: 'HAND WASHING', content: 'Wash hands for 20 seconds on arrival, after breaks, and between tasks.' },
        { title: 'TEMPERATURE DANGER ZONE', content: 'Keep cold food below 5°C and hot food above 60°C. Record fridge temps daily.' },
        { title: 'CROSS-CONTAMINATION', content: 'Use separate boards and utensils for raw and ready-to-eat foods.' },
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
      })),
    })
  }

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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
