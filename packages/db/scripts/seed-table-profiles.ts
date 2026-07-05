import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const VENUE_ID = '00000000-0000-0000-0000-000000000001'

interface ProfileDef {
  name: string
  type: string
  capacity: number
  width: number
  depth: number
  shape: string
  colour: string
  chairCount: number
  seatingDensity: number | null
  maxHeadChairs: number
}

function banquet(num: number): ProfileDef {
  return {
    name: `BANQUET ${num}`,
    type: 'TABLE',
    capacity: 16,
    width: 100,
    depth: 600,
    shape: 'RECTANGLE',
    colour: '#3D3D4D',
    chairCount: 16,
    seatingDensity: 75,
    maxHeadChairs: 1,
  }
}

function standard(num: number): ProfileDef {
  return {
    name: `TABLE ${num}`,
    type: 'TABLE',
    capacity: 4,
    width: 80,
    depth: 80,
    shape: 'RECTANGLE',
    colour: '#555555',
    chairCount: 4,
    seatingDensity: 60,
    maxHeadChairs: 1,
  }
}

async function main() {
  const profiles: ProfileDef[] = [
    ...Array.from({ length: 5 }, (_, i) => standard(20 + i)),
    ...Array.from({ length: 5 }, (_, i) => banquet(25 + i)),
    ...Array.from({ length: 9 }, (_, i) => standard(30 + i)),
  ]

  for (const p of profiles) {
    const existing = await prisma.tableProfile.findFirst({
      where: { venueId: VENUE_ID, name: p.name, deletedAt: null },
    })
    if (existing) {
      console.log(`SKIP: ${p.name} already exists`)
      continue
    }
    await prisma.tableProfile.create({
      data: {
        venueId: VENUE_ID,
        ...p,
      },
    })
    console.log(`CREATED: ${p.name}`)
  }

  const count = await prisma.tableProfile.count({ where: { venueId: VENUE_ID, deletedAt: null } })
  console.log(`\nTotal table profiles in venue: ${count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
