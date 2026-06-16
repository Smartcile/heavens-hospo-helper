import { StructureClient } from '@/components/admin/StructureClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function StructurePage() {
  const session = await getServerSession(authOptions)
  return <StructureClient role={session!.user.role} />
}
