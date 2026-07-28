import { prisma } from '@hospo-ops/db'

export function giftCardNumberForYear(year: number, sequence: number): string {
  return `${year}${String(sequence).padStart(4, '0')}`
}

export function parseGiftCardNumber(number: string): { year: number; sequence: number } | null {
  const match = number.match(/^(\d{4})(\d{4})$/)
  if (!match) return null
  return { year: parseInt(match[1], 10), sequence: parseInt(match[2], 10) }
}

export async function getNextNumber(venueId: string, year: number): Promise<string> {
  const prefix = `${year}`
  const latest = await prisma.giftCard.findFirst({
    where: {
      venueId,
      number: { startsWith: prefix },
      deletedAt: null,
    },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  if (!latest) return giftCardNumberForYear(year, 1)

  const parsed = parseGiftCardNumber(latest.number)
  if (!parsed) throw new Error(`Invalid gift card number in database: ${latest.number}`)

  return giftCardNumberForYear(year, parsed.sequence + 1)
}

export async function bulkCreateDrafts(
  venueId: string,
  year: number,
  count: number,
  amount: number,
): Promise<string[]> {
  if (count < 1 || count > 1000) throw new Error('Count must be between 1 and 1000')

  const startNumber = await getNextNumber(venueId, year)
  const parsed = parseGiftCardNumber(startNumber)!

  const numbers: string[] = []
  for (let i = 0; i < count; i++) {
    numbers.push(giftCardNumberForYear(year, parsed.sequence + i))
  }

  await prisma.giftCard.createMany({
    data: numbers.map((number) => ({
      venueId,
      number,
      amount,
      status: 'DRAFT' as const,
    })),
  })

  return numbers
}
