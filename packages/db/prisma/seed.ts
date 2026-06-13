import { PrismaClient, Role, CompletionType, ScheduleType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

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
  const deptBar = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'BAR',
      venueId: venue.id,
      colour: '#6B6B6B',
      isActive: true,
    },
  })

  const deptKitchen = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'KITCHEN',
      venueId: venue.id,
      colour: '#4ADE80',
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
  const pinManager1 = await bcrypt.hash('1111', 10)
  const pinManager2 = await bcrypt.hash('2222', 10)
  const pinManager3 = await bcrypt.hash('3333', 10)
  const pwAdmin = await bcrypt.hash('admin1234', 10)
  const pwBar = await bcrypt.hash('bar1234', 10)
  const pwKitchen = await bcrypt.hash('kitchen1234', 10)
  const pwFoh = await bcrypt.hash('foh1234', 10)

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

  const barManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: { email: 'bar@demo.com', password: pwBar },
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      firstName: 'BAR',
      lastName: 'MANAGER',
      pin: pinManager1,
      email: 'bar@demo.com',
      password: pwBar,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptBar.id,
      isActive: true,
    },
  })

  const kitchenManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000022' },
    update: { email: 'kitchen@demo.com', password: pwKitchen },
    create: {
      id: '00000000-0000-0000-0000-000000000022',
      firstName: 'KITCHEN',
      lastName: 'MANAGER',
      pin: pinManager2,
      email: 'kitchen@demo.com',
      password: pwKitchen,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptKitchen.id,
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
      pin: pinManager3,
      email: 'foh@demo.com',
      password: pwFoh,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptFOH.id,
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

  // BAR tasks
  const barDailyTasks = [
    { title: 'WIPE DOWN ALL BAR SURFACES', description: 'Clean all countertops, taps, and back bar surfaces' },
    { title: 'RESTOCK GLASS FRIDGE', description: 'Ensure glass fridge is fully stocked and organised' },
    { title: 'CHECK BEER LINE PRESSURE', description: 'Verify all keg pressures are within acceptable range' },
    { title: 'CLEAN COFFEE MACHINE', description: 'Backflush, clean group heads and steam wands' },
    { title: 'COUNT OPENING FLOAT', description: 'Count and verify opening cash float matches POS record' },
  ]

  for (let i = 0; i < barDailyTasks.length; i++) {
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`,
        ...barDailyTasks[i],
        venueId: venue.id,
        departmentId: deptBar.id,
        completionType: i === 4 ? CompletionType.TICK_NOTE : CompletionType.TICK,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  const barWeeklyTasks = [
    { title: 'DEEP CLEAN BEHIND BAR', description: 'Move all equipment and clean floor and walls behind bar', days: [1] },
    { title: 'AUDIT SPIRITS INVENTORY', description: 'Count and record all spirit bottles, note any shortages', days: [1] },
  ]

  for (let i = 0; i < barWeeklyTasks.length; i++) {
    const { days, ...task } = barWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0002-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptBar.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: barDailyTasks.length + i,
        isActive: true,
      },
    })
  }

  // KITCHEN tasks
  const kitchenDailyTasks = [
    { title: 'CHECK FRIDGE TEMPERATURES', description: 'Record all fridge and freezer temperatures in log', type: CompletionType.TICK_NOTE },
    { title: 'SANITISE ALL PREP SURFACES', description: 'Clean and sanitise all cutting boards and prep benches', type: CompletionType.TICK },
    { title: 'CHECK OIL LEVELS IN FRYERS', description: 'Inspect oil quality and refill or change as needed', type: CompletionType.TICK },
    { title: 'RESTOCK DRY STORE', description: 'Rotate stock, bring forward older items, note shortages', type: CompletionType.TICK_NOTE },
    { title: 'EMPTY AND CLEAN BIN AREA', description: 'Empty all bins, wash bin area, replace liners', type: CompletionType.TICK_PHOTO },
  ]

  for (let i = 0; i < kitchenDailyTasks.length; i++) {
    const { type, ...task } = kitchenDailyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0003-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptKitchen.id,
        completionType: type,
        scheduleType: ScheduleType.DAILY,
        scheduleDays: [],
        sortOrder: i,
        isActive: true,
      },
    })
  }

  const kitchenWeeklyTasks = [
    { title: 'CLEAN BEHIND ALL EQUIPMENT', description: 'Pull out ovens, fryers, and fridges to clean underneath and behind', days: [1] },
    { title: 'CALIBRATE THERMOMETERS', description: 'Test and calibrate all probe thermometers against reference', days: [3] },
  ]

  for (let i = 0; i < kitchenWeeklyTasks.length; i++) {
    const { days, ...task } = kitchenWeeklyTasks[i]
    await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0004-${String(i).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0004-${String(i).padStart(12, '0')}`,
        ...task,
        venueId: venue.id,
        departmentId: deptKitchen.id,
        completionType: CompletionType.TICK_NOTE,
        scheduleType: ScheduleType.WEEKLY,
        scheduleDays: days,
        sortOrder: kitchenDailyTasks.length + i,
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
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      venueId: venue.id,
      departmentId: deptBar.id,
      label: 'BAR ENTRY QR',
      token: 'demo-bar-token-001',
      isActive: true,
    },
  })

  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      venueId: venue.id,
      departmentId: deptKitchen.id,
      label: 'KITCHEN ENTRY QR',
      token: 'demo-kitchen-token-001',
      isActive: true,
    },
  })

  await prisma.qRCode.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000032',
      venueId: venue.id,
      departmentId: deptFOH.id,
      label: 'FOH ENTRY QR',
      token: 'demo-foh-token-001',
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
      name: 'BAR OPEN',
      description: 'Opening checklist for the bar.',
      category: 'BAR',
      items: [
        { title: 'COUNT OPENING FLOAT', completionType: 'TICK_NOTE' },
        { title: 'TURN ON COFFEE MACHINE AND CALIBRATE', completionType: 'TICK' },
        { title: 'CHECK BEER LINE PRESSURE', completionType: 'TICK' },
        { title: 'STOCK GLASS FRIDGE AND GARNISHES', completionType: 'TICK' },
        { title: 'WIPE DOWN ALL BAR SURFACES', completionType: 'TICK' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000002',
      name: 'BAR CLOSE',
      description: 'Closing checklist for the bar.',
      category: 'BAR',
      items: [
        { title: 'CLEAN AND BACKFLUSH COFFEE MACHINE', completionType: 'TICK' },
        { title: 'EMPTY AND CLEAN DRIP TRAYS', completionType: 'TICK' },
        { title: 'CASH UP AND RECORD TAKINGS', completionType: 'TICK_NOTE' },
        { title: 'LOCK SPIRITS AND SECURE TILL', completionType: 'TICK' },
        { title: 'PHOTO OF CLEAN BAR FOR HANDOVER', completionType: 'TICK_PHOTO' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000003',
      name: 'KITCHEN OPEN',
      description: 'Opening checklist for the kitchen.',
      category: 'KITCHEN',
      items: [
        { title: 'RECORD ALL FRIDGE AND FREEZER TEMPERATURES', completionType: 'TICK_NOTE' },
        { title: 'CHECK OIL LEVELS AND QUALITY IN FRYERS', completionType: 'TICK' },
        { title: 'SANITISE ALL PREP SURFACES', completionType: 'TICK' },
        { title: 'CHECK DELIVERIES AGAINST DOCKETS', completionType: 'TICK_NOTE' },
        { title: 'PREP MISE EN PLACE FOR SERVICE', completionType: 'TICK' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000004',
      name: 'KITCHEN CLOSE',
      description: 'Closing checklist for the kitchen.',
      category: 'KITCHEN',
      items: [
        { title: 'RECORD CLOSING FRIDGE TEMPERATURES', completionType: 'TICK_NOTE' },
        { title: 'CLEAN AND DEGREASE COOKLINE', completionType: 'TICK' },
        { title: 'EMPTY AND SANITISE BINS', completionType: 'TICK' },
        { title: 'WRAP, LABEL AND DATE ALL OPEN STOCK', completionType: 'TICK' },
        { title: 'PHOTO OF CLEAN KITCHEN FOR HANDOVER', completionType: 'TICK_PHOTO' },
      ],
    },
    {
      id: '00000000-0000-0000-00a0-000000000005',
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
      id: '00000000-0000-0000-00a0-000000000006',
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
      id: '00000000-0000-0000-00a0-000000000007',
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

  console.log('Seed complete.')
  console.log('Admin/manager web logins (email / password):')
  console.log('  admin@demo.com   / admin1234    (ADMIN)')
  console.log('  bar@demo.com     / bar1234      (BAR MANAGER)')
  console.log('  kitchen@demo.com / kitchen1234  (KITCHEN MANAGER)')
  console.log('  foh@demo.com     / foh1234      (FOH MANAGER)')
  console.log('Worker QR + PIN logins: 0000 / 1111 / 2222 / 3333')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
