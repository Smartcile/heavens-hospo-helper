import { HelpClient } from '@/components/admin/HelpClient'

export default function WorkerHelpPage() {
  return (
    <div className="p-4">
      <HelpClient endpoint="/api/worker/help" />
    </div>
  )
}
