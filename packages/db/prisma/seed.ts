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

  // Create staff
  const pinAdmin = await bcrypt.hash('0000', 10)
  const pinManager1 = await bcrypt.hash('1111', 10)
  const pinManager2 = await bcrypt.hash('2222', 10)
  const pinManager3 = await bcrypt.hash('3333', 10)

  const adminStaff = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      firstName: 'ADMIN',
      lastName: 'USER',
      pin: pinAdmin,
      role: Role.ADMIN,
      venueId: venue.id,
      isActive: true,
      swiftPosId: 'admin@demo.com',
    },
  })

  const barManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      firstName: 'BAR',
      lastName: 'MANAGER',
      pin: pinManager1,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptBar.id,
      isActive: true,
      swiftPosId: 'bar@demo.com',
    },
  })

  const kitchenManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000022' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000022',
      firstName: 'KITCHEN',
      lastName: 'MANAGER',
      pin: pinManager2,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptKitchen.id,
      isActive: true,
      swiftPosId: 'kitchen@demo.com',
    },
  })

  const fohManager = await prisma.staff.upsert({
    where: { id: '00000000-0000-0000-0000-000000000023' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000023',
      firstName: 'FOH',
      lastName: 'MANAGER',
      pin: pinManager3,
      role: Role.MANAGER,
      venueId: venue.id,
      departmentId: deptFOH.id,
      isActive: true,
      swiftPosId: 'foh@demo.com',
    },
  })

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

  console.log('Seed complete.')
  console.log('Admin logins (email / PIN):')
  console.log('  admin@demo.com / 0000  (ADMIN)')
  console.log('  bar@demo.com   / 1111  (BAR MANAGER)')
  console.log('  kitchen@demo.com / 2222  (KITCHEN MANAGER)')
  console.log('  foh@demo.com   / 3333  (FOH MANAGER)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
