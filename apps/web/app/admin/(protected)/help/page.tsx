import { HelpClient } from '@/components/admin/HelpClient'

export default function AdminHelpPage() {
  return (
    <div className="p-4 md:p-6">
      <HelpClient endpoint="/api/admin/help" />
    </div>
  )
}
