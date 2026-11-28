import type { SidebarSettings } from '@kobato/settings/types'

import { DailyQuoteCard } from '@/ui/settings/sidebar/DailyQuoteCard'
import { SidebarWidgetsCard } from '@/ui/settings/sidebar/SidebarWidgetsCard'

export function SidebarForm({ sidebar }: { sidebar: SidebarSettings }) {
  return (
    <div className="flex flex-col gap-5">
      <SidebarWidgetsCard sidebar={sidebar} />
      <DailyQuoteCard sidebar={sidebar} />
    </div>
  )
}
