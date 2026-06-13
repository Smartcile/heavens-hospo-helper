import { BudgetClient } from '@/components/admin/BudgetClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function BudgetPage() {
  const session = await getServerSession(authOptions)
  return <BudgetClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
