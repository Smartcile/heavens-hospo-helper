/*
 * MOCK DATA — FURNITURE + TABLE PLANNER
 *
 * Builds a realistic dining room so the planner can be seen working end to end:
 * a furniture library (including custom polygon shapes), a floor plan with
 * walls and section zones, a default everyday layout, an event layout with
 * joined banquet runs, and bookings sitting on real tables.
 *
 * Idempotent — every row has a fixed id, so re-running refreshes rather than
 * duplicates. Scoped to one venue and touches nothing else.
 *
 *   npm run db:mock-furniture              # THE TESTURANT
 *   npm run db:mock-furniture -- <venueId>
 */
import { prisma, Prisma } from '../index'
import { defaultChairSlots } from '../../../apps/web/lib/furniture'

const DEFAULT_VENUE_ID = '40e6b2e0-402e-4328-8f95-30818209fb6a' // THE TESTURANT

/** Fixed-id helpers, so re-running updates the same rows. */
const F = (n: string) => `00000000-0000-0000-0f01-${n.padStart(12, '0')}` // furniture
const E = (n: string) => `00000000-0000-0000-0f02-${n.padStart(12, '0')}` // plan elements
const S = (n: string) => `00000000-0000-0000-0f03-${n.padStart(12, '0')}` // setup items
const G = (n: string) => `00000000-0000-0000-0f04-${n.padStart(12, '0')}` // table groups
const B = (n: string) => `00000000-0000-0000-0f05-${n.padStart(12, '0')}` // bookings

const PLAN_ID = '00000000-0000-0000-0f00-000000000001'
const SETUP_DEFAULT = '00000000-0000-0000-0f00-000000000002'
const SETUP_WEDDING = '00000000-0000-0000-0f00-000000000003'

const ROOM_W = 1600
const ROOM_D = 1000

type Vertex = { x: number; y: number }
const json = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))

/** A banquette with a straight back and a bowed front. */
function curvedBanquette(width: number, depth: number, steps = 10): Vertex[] {
  const pts: Vertex[] = [{ x: 0, y: 0 }, { x: width, y: 0 }]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    pts.push({ x: width - width * t, y: depth * Math.sin(Math.PI * t) })
  }
  return pts
}

// ── The furniture library ──────────────────────────────────────────────────

interface FurnitureSpec {
  id: string
  name: string
  type: string
  shape: 'RECTANGLE' | 'CIRCLE' | 'POLYGON'
  width: number
  depth: number
  vertices?: Vertex[] | null
  colour: string
  qty: number
  seats: number
  density?: number | null
  maxHead?: number
  numbers?: string[] | null
  chair?: string // name of the chair type that seats it
}

const CHAIRS: FurnitureSpec[] = [
  { id: F('101'), name: 'DINING CHAIR', type: 'CHAIR', shape: 'RECTANGLE', width: 45, depth: 45, colour: '#6B6B6B', qty: 160, seats: 0 },
  { id: F('102'), name: 'BANQUET CHAIR', type: 'CHAIR', shape: 'RECTANGLE', width: 43, depth: 43, colour: '#5A5A6B', qty: 200, seats: 0 },
  { id: F('103'), name: 'BARSTOOL', type: 'CHAIR', shape: 'RECTANGLE', width: 38, depth: 38, colour: '#6B5A4A', qty: 24, seats: 0 },
  { id: F('104'), name: 'TUB CHAIR', type: 'CHAIR', shape: 'RECTANGLE', width: 60, depth: 58, colour: '#6B5A5A', qty: 18, seats: 0 },
]

const TABLES: FurnitureSpec[] = [
  {
    id: F('201'), name: 'ROUND 8-TOP', type: 'TABLE', shape: 'CIRCLE',
    width: 150, depth: 150, colour: '#C99A3B', qty: 12, seats: 8, density: 58, maxHead: 1,
    numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], chair: 'BANQUET CHAIR',
  },
  {
    id: F('202'), name: 'SQUARE 4-TOP', type: 'TABLE', shape: 'RECTANGLE',
    width: 80, depth: 80, colour: '#E6C347', qty: 14, seats: 4, density: 60, maxHead: 1,
    numbers: ['20', '21', '22', '23', '24', '25', '26', '27'], chair: 'DINING CHAIR',
  },
  {
    id: F('203'), name: 'RECT 6-TOP', type: 'TABLE', shape: 'RECTANGLE',
    width: 180, depth: 75, colour: '#D9B44A', qty: 8, seats: 6, density: 60, maxHead: 1,
    numbers: ['30', '31', '32', '33', '34', '35'], chair: 'DINING CHAIR',
  },
  {
    // The joinery workhorse — drag two together and they snap into a run.
    id: F('204'), name: 'BANQUET TRESTLE', type: 'TABLE', shape: 'RECTANGLE',
    width: 240, depth: 75, colour: '#B8912F', qty: 24, seats: 8, density: 60, maxHead: 1,
    numbers: null, chair: 'BANQUET CHAIR',
  },
  {
    id: F('205'), name: 'HIGH BAR TABLE', type: 'BAR', shape: 'CIRCLE',
    width: 70, depth: 70, colour: '#8C6D3F', qty: 6, seats: 3, density: 55, maxHead: 1,
    numbers: ['40', '41', '42', '43'], chair: 'BARSTOOL',
  },
  {
    // Custom shapes — the reason the polygon editor exists.
    id: F('301'), name: 'L-SHAPED BOOTH', type: 'BOOTH', shape: 'POLYGON',
    width: 220, depth: 220, colour: '#7A4A4A', qty: 4, seats: 8, density: 62, maxHead: 2,
    vertices: [
      { x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 80 },
      { x: 80, y: 80 }, { x: 80, y: 220 }, { x: 0, y: 220 },
    ],
    numbers: ['50', '51', '52', '53'], chair: 'BANQUET CHAIR',
  },
  {
    id: F('302'), name: 'CORNER SOFA', type: 'SOFA', shape: 'POLYGON',
    width: 240, depth: 200, colour: '#4A5A6B', qty: 3, seats: 6, density: 70, maxHead: 2,
    vertices: [
      { x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 90 },
      { x: 90, y: 90 }, { x: 90, y: 200 }, { x: 0, y: 200 },
    ],
    numbers: ['60', '61', '62'], chair: 'TUB CHAIR',
  },
  {
    id: F('303'), name: 'CURVED BANQUETTE', type: 'BOOTH', shape: 'POLYGON',
    width: 260, depth: 95, colour: '#5A4A6B', qty: 2, seats: 7, density: 60, maxHead: 2,
    vertices: curvedBanquette(260, 95),
    numbers: ['70', '71'], chair: 'BANQUET CHAIR',
  },
]

/** Consumables that go on a table — the bill of materials. */
const CONSUMABLES = [
  { id: F('401'), name: 'LINEN NAPKIN', qty: 400 },
  { id: F('402'), name: 'DINNER PLATE', qty: 300 },
  { id: F('403'), name: 'WINE GLASS', qty: 260 },
  { id: F('404'), name: 'CUTLERY SET', qty: 320 },
  { id: F('405'), name: 'TABLE CANDLE', qty: 60 },
  { id: F('406'), name: 'SALT & PEPPER SET', qty: 55 },
  { id: F('407'), name: 'WHITE TABLECLOTH', qty: 70 },
]

async function categoryFor(venueId: string, name: string, equipment: boolean) {
  const found = await prisma.inventoryCategory.findFirst({
    where: { name, deletedAt: null, OR: [{ venueId }, { venueId: null }] },
    orderBy: { venueId: 'desc' },
  })
  if (found) return found.id
  const made = await prisma.inventoryCategory.create({
    data: { venueId, name, tab: null, isBuiltIn: false, showEquipmentFields: equipment },
  })
  return made.id
}

async function main() {
  const venueId = process.argv[2] ?? DEFAULT_VENUE_ID

  const venue = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } })
  if (!venue) {
    console.error(`No venue with id ${venueId}. Pass a venue id as the first argument.`)
    process.exitCode = 1
    return
  }

  console.log('=== MOCK FURNITURE + TABLE PLANNER DATA ===')
  console.log(`Venue: ${venue.name}\n`)

  const tablesCat = await categoryFor(venueId, 'TABLES', true)
  const crockeryCat = await categoryFor(venueId, 'CROCKERY', true)

  // ── Consumables ──
  for (const c of CONSUMABLES) {
    await prisma.inventoryItem.upsert({
      where: { id: c.id },
      update: { name: c.name, totalQty: c.qty, deletedAt: null },
      create: {
        id: c.id, venueId, categoryId: crockeryCat, name: c.name,
        unit: 'EA', totalQty: c.qty, defaultParLevel: Math.round(c.qty * 0.2),
      },
    })
  }
  console.log(`  ${CONSUMABLES.length} consumables`)

  // ── Furniture (chairs first so tables can reference them) ──
  const byName = new Map<string, string>()
  for (const f of [...CHAIRS, ...TABLES]) {
    const data = {
      venueId,
      categoryId: tablesCat,
      name: f.name,
      unit: 'EA',
      totalQty: f.qty,
      furnitureType: f.type,
      elementWidth: f.width,
      elementDepth: f.depth,
      elementShape: f.shape,
      elementVertices: json(f.shape === 'POLYGON' ? f.vertices : null),
      defaultColour: f.colour,
      defaultChairCount: f.seats,
      seatingDensity: f.density ?? null,
      maxHeadChairs: f.maxHead ?? 1,
      tableNumbers: json(f.numbers ?? null),
      chairItemId: f.chair ? byName.get(f.chair) ?? null : null,
      deletedAt: null,
    }
    await prisma.inventoryItem.upsert({
      where: { id: f.id },
      update: data,
      create: { id: f.id, ...data },
    })
    byName.set(f.name, f.id)
  }
  console.log(`  ${CHAIRS.length} chair types, ${TABLES.length} table types (3 custom shapes)`)

  // ── Bills of materials ──
  const bom: [string, string, number, boolean][] = [
    // table, item, qty, perChair
    ['ROUND 8-TOP', 'WHITE TABLECLOTH', 1, false],
    ['ROUND 8-TOP', 'TABLE CANDLE', 1, false],
    ['ROUND 8-TOP', 'LINEN NAPKIN', 1, true],
    ['ROUND 8-TOP', 'DINNER PLATE', 1, true],
    ['ROUND 8-TOP', 'WINE GLASS', 2, true],
    ['ROUND 8-TOP', 'CUTLERY SET', 1, true],
    ['SQUARE 4-TOP', 'SALT & PEPPER SET', 1, false],
    ['SQUARE 4-TOP', 'LINEN NAPKIN', 1, true],
    ['SQUARE 4-TOP', 'CUTLERY SET', 1, true],
    ['RECT 6-TOP', 'SALT & PEPPER SET', 1, false],
    ['RECT 6-TOP', 'LINEN NAPKIN', 1, true],
    ['RECT 6-TOP', 'CUTLERY SET', 1, true],
    ['BANQUET TRESTLE', 'WHITE TABLECLOTH', 1, false],
    ['BANQUET TRESTLE', 'LINEN NAPKIN', 1, true],
    ['BANQUET TRESTLE', 'DINNER PLATE', 1, true],
    ['BANQUET TRESTLE', 'WINE GLASS', 2, true],
    ['BANQUET TRESTLE', 'CUTLERY SET', 1, true],
    ['L-SHAPED BOOTH', 'TABLE CANDLE', 2, false],
    ['L-SHAPED BOOTH', 'LINEN NAPKIN', 1, true],
  ]
  for (const [table, item, qty, perChair] of bom) {
    const furnitureItemId = byName.get(table)
    const inventoryItemId = CONSUMABLES.find((c) => c.name === item)?.id
    if (!furnitureItemId || !inventoryItemId) continue
    await prisma.furnitureBomItem.upsert({
      where: { furnitureItemId_inventoryItemId: { furnitureItemId, inventoryItemId } },
      update: { quantity: qty, perChair },
      create: { furnitureItemId, inventoryItemId, quantity: qty, perChair },
    })
  }
  console.log(`  ${bom.length} bill-of-materials lines`)

  // ── Floor plan ──
  const sections = await prisma.section.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true },
  })
  const sec = (name: string) => sections.find((s) => s.name === name)?.id ?? sections[0]?.id ?? null

  const zones = [
    { id: 'zone-inside', x: 100, y: 250, width: 900, height: 650, sectionId: sec('FLOOR INSIDE'), label: 'FLOOR INSIDE' },
    { id: 'zone-bar', x: 100, y: 60, width: 900, height: 170, sectionId: sec('FLOOR BAR'), label: 'FLOOR BAR' },
    { id: 'zone-outside', x: 1040, y: 60, width: 480, height: 840, sectionId: sec('FLOOR OUTSIDE'), label: 'FLOOR OUTSIDE' },
  ].filter((z) => z.sectionId)

  await prisma.floorPlan.upsert({
    where: { id: PLAN_ID },
    update: { name: 'MAIN DINING ROOM', roomWidth: ROOM_W, roomDepth: ROOM_D, gridUnit: 25, zones: json(zones), deletedAt: null },
    create: {
      id: PLAN_ID, venueId, name: 'MAIN DINING ROOM', slug: 'main-dining-room',
      isDefault: true, roomWidth: ROOM_W, roomDepth: ROOM_D, gridUnit: 25, zones: json(zones),
    },
  })

  // Walls, bar and fixtures — the building, not the furniture.
  const T = 20
  const elements: { id: string; type: string; x: number; y: number; w: number; d: number; label?: string; colour?: string }[] = [
    { id: E('1'), type: 'WALL', x: 40, y: 20, w: ROOM_W - 80, d: T },
    { id: E('2'), type: 'WALL', x: 40, y: ROOM_D - 40, w: ROOM_W - 80, d: T },
    { id: E('3'), type: 'WALL', x: 40, y: 20, w: T, d: ROOM_D - 60 },
    { id: E('4'), type: 'WALL', x: ROOM_W - 60, y: 20, w: T, d: ROOM_D - 60 },
    // Partition between inside and the terrace
    { id: E('5'), type: 'WALL', x: 1010, y: 260, w: T, d: 640 },
    { id: E('6'), type: 'BAR', x: 120, y: 90, w: 620, d: 70, label: 'BAR', colour: '#4A3A2A' },
    { id: E('7'), type: 'COUNTER', x: 780, y: 90, w: 200, d: 70, label: 'PASS', colour: '#3A3A4A' },
    { id: E('8'), type: 'ENTRY', x: 700, y: ROOM_D - 45, w: 140, d: 30, label: 'ENTRANCE', colour: '#2E5A2E' },
    { id: E('9'), type: 'DOOR', x: 1010, y: 520, w: T, d: 120, label: 'TERRACE' },
  ]
  for (const [i, el] of elements.entries()) {
    const data = {
      floorPlanId: PLAN_ID, type: el.type as never, shape: 'RECTANGLE' as never,
      x: el.x, y: el.y, width: el.w, depth: el.d, rotation: 0,
      label: el.label ?? null, labelVisible: !!el.label,
      fillColour: el.colour ?? '#4A4A4A', opacity: 1, zIndex: 0, sortOrder: i,
      isActive: true, deletedAt: null,
    }
    await prisma.floorPlanElement.upsert({ where: { id: el.id }, update: data, create: { id: el.id, ...data } })
  }
  console.log(`  floor plan "MAIN DINING ROOM" ${ROOM_W}×${ROOM_D}cm — ${elements.length} fixtures, ${zones.length} zones`)

  // ── Layouts ──
  await prisma.floorPlanSetup.upsert({
    where: { id: SETUP_DEFAULT },
    update: { name: 'DEFAULT LAYOUT', isDefault: true, deletedAt: null },
    create: { id: SETUP_DEFAULT, floorPlanId: PLAN_ID, name: 'DEFAULT LAYOUT', isDefault: true },
  })
  await prisma.floorPlanSetup.upsert({
    where: { id: SETUP_WEDDING },
    update: { name: 'WEDDING RECEPTION', isDefault: false, deletedAt: null, notes: 'Banquet runs of 3 joined trestles.' },
    create: {
      id: SETUP_WEDDING, floorPlanId: PLAN_ID, name: 'WEDDING RECEPTION',
      isDefault: false, notes: 'Banquet runs of 3 joined trestles.',
    },
  })
  // Any other default on this plan would make "what does the room revert to?" ambiguous.
  await prisma.floorPlanSetup.updateMany({
    where: { floorPlanId: PLAN_ID, isDefault: true, id: { not: SETUP_DEFAULT } },
    data: { isDefault: false },
  })

  /** Place a piece of furniture, seating it from its own rules. */
  async function place(
    id: string, setupId: string, name: string, x: number, y: number,
    opts: { rotation?: number; number?: string | null; groupId?: string | null; sort?: number } = {},
  ) {
    const f = TABLES.find((t) => t.name === name)
    if (!f) return
    const chairs = defaultChairSlots(
      { shape: f.shape, width: f.width, depth: f.depth, vertices: f.vertices ?? null },
      { seatingDensity: f.density, maxHeadChairs: f.maxHead ?? 1, capacity: f.seats || undefined },
    )
    const sectionId = zones.find((z) =>
      x + f.width / 2 >= z.x && x + f.width / 2 <= z.x + z.width &&
      y + f.depth / 2 >= z.y && y + f.depth / 2 <= z.y + z.height,
    )?.sectionId ?? null

    const data = {
      setupId, furnitureItemId: f.id, tableProfileId: null,
      x, y, rotation: opts.rotation ?? 0, sectionId,
      tableGroupId: opts.groupId ?? null,
      assignedNumber: opts.number ?? null,
      label: opts.number ?? f.name,
      chairs: json(chairs), sortOrder: opts.sort ?? 0,
      isActive: true, deletedAt: null,
    }
    await prisma.setupItem.upsert({ where: { id }, update: data, create: { id, ...data } })
  }

  // ── DEFAULT LAYOUT — everyday à la carte service ──
  let n = 0
  const defaultPlacements: [string, number, number, string | null, number][] = [
    // name, x, y, number, rotation
    ['ROUND 8-TOP', 160, 330, '1', 0],
    ['ROUND 8-TOP', 420, 330, '2', 0],
    ['ROUND 8-TOP', 680, 330, '3', 0],
    ['SQUARE 4-TOP', 180, 580, '20', 0],
    ['SQUARE 4-TOP', 340, 580, '21', 0],
    ['SQUARE 4-TOP', 500, 580, '22', 0],
    ['SQUARE 4-TOP', 660, 580, '23', 0],
    ['RECT 6-TOP', 160, 760, '30', 0],
    ['RECT 6-TOP', 420, 760, '31', 0],
    ['RECT 6-TOP', 680, 760, '32', 0],
    ['L-SHAPED BOOTH', 760, 560, '50', 0],
    ['HIGH BAR TABLE', 200, 180, '40', 0],
    ['HIGH BAR TABLE', 360, 180, '41', 0],
    ['HIGH BAR TABLE', 520, 180, '42', 0],
    ['CORNER SOFA', 1080, 120, '60', 0],
    ['CURVED BANQUETTE', 1120, 420, '70', 0],
    ['SQUARE 4-TOP', 1120, 620, '24', 0],
    ['SQUARE 4-TOP', 1280, 620, '25', 0],
    ['ROUND 8-TOP', 1150, 740, '4', 0],
  ]
  for (const [name, x, y, num, rot] of defaultPlacements) {
    await place(S(String(++n)), SETUP_DEFAULT, name, x, y, { number: num, rotation: rot, sort: n })
  }
  console.log(`  DEFAULT LAYOUT — ${defaultPlacements.length} tables placed and numbered`)

  // ── WEDDING RECEPTION — three joined banquet runs plus a top table ──
  for (let r = 0; r < 3; r++) {
    const groupId = G(String(r + 1))
    await prisma.tableGroup.upsert({
      where: { id: groupId },
      update: { setupId: SETUP_WEDDING, name: `RUN ${r + 1}`, deletedAt: null },
      create: { id: groupId, setupId: SETUP_WEDDING, name: `RUN ${r + 1}` },
    })
    // Trestles butted end to end — this is what the auto-join produces.
    for (let t = 0; t < 3; t++) {
      await place(S(String(++n)), SETUP_WEDDING, 'BANQUET TRESTLE', 180 + t * 240, 420 + r * 180, {
        groupId, sort: n,
      })
    }
  }
  await place(S(String(++n)), SETUP_WEDDING, 'BANQUET TRESTLE', 300, 220, { sort: n, number: null })
  await place(S(String(++n)), SETUP_WEDDING, 'BANQUET TRESTLE', 560, 220, { sort: n, number: null })
  console.log('  WEDDING RECEPTION — 3 joined runs of 3 trestles + a 2-trestle top table')

  // ── Bookings on real tables, today ──
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const placed = await prisma.setupItem.findMany({
    where: { setupId: SETUP_DEFAULT, deletedAt: null },
    select: { id: true, assignedNumber: true },
  })
  const tableByNumber = new Map(placed.map((p) => [p.assignedNumber, p.id]))

  const bookings: [string, string, string, string, number, string, string[]][] = [
    // id, name, phone, start, pax, end, table numbers
    [B('1'), 'SARAH MCKENZIE', '0211234567', '18:00', 8, '20:00', ['1']],
    [B('2'), 'THE PATEL FAMILY', '0219876543', '18:30', 4, '20:30', ['20']],
    [B('3'), 'JAMES WHITAKER', '0275551234', '19:00', 6, '21:00', ['30']],
    [B('4'), 'AROHA NGATA', '0224445555', '19:00', 12, '21:30', ['2', '3']],
    [B('5'), 'DANIEL O\'CONNOR', '0217778888', '19:30', 2, '21:00', ['21']],
    [B('6'), 'MEI LIN CHEN', '0223334444', '20:00', 8, '22:00', ['50']],
  ]

  for (const [id, name, phone, start, pax, end, numbers] of bookings) {
    const tableIds = numbers.map((num) => tableByNumber.get(num)).filter((v): v is string => !!v)
    await prisma.bookingTable.deleteMany({ where: { bookingId: id } })
    const data = {
      venueId, date: today, startTime: start, endTime: end,
      partySize: pax, contactName: name, contactPhone: phone,
      source: 'PHONE' as never, status: 'CONFIRMED' as never,
      seatingSetupId: SETUP_DEFAULT, deletedAt: null,
    }
    await prisma.booking.upsert({ where: { id }, update: data, create: { id, ...data } })
    if (tableIds.length > 0) {
      await prisma.bookingTable.createMany({
        data: tableIds.map((setupItemId) => ({ bookingId: id, setupItemId })),
      })
    }
  }
  console.log(`  ${bookings.length} bookings for today, seated on real tables`)

  console.log('\nMock data ready.')
  console.log(`  Floor plan:  /admin/floorplan  →  MAIN DINING ROOM`)
  console.log(`  Furniture:   /admin/inventory  →  TABLES`)
  console.log(`  Bookings:    /admin/bookings`)
}

main()
  .catch((e) => {
    console.error('Mock data failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
