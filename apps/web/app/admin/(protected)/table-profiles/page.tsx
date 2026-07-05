import { TableProfilesClient } from './TableProfilesClient'

export const dynamic = 'force-dynamic'

export default function TableProfilesPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <TableProfilesClient />
    </div>
  )
}
