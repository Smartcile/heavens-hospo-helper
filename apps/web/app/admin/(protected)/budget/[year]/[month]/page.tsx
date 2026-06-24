import { BudgetPageClient } from '@/components/admin/BudgetPageClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notFound } from 'next/navigation'

export default async function BudgetMonthPage({
  params,
}: {
  params: { year: string; month: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const year = Number(params.year)
  const month = Number(params.month)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    notFound()
  }

  return (
    <BudgetPageClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      year={year}
      month={month}
    />
  )
}
