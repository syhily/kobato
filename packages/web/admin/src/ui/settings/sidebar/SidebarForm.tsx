import type { SidebarSettings } from '@kobato/settings/types.ts'

import { DailyQuoteCard } from '@kobato/web-admin/ui/settings/sidebar/DailyQuoteCard.tsx'
import { SidebarWidgetsCard } from '@kobato/web-admin/ui/settings/sidebar/SidebarWidgetsCard.tsx'

export function SidebarForm({ sidebar }: { sidebar: SidebarSettings }) {
  return (
    <div className="flex flex-col gap-5">
      <SidebarWidgetsCard sidebar={sidebar} />
      <DailyQuoteCard sidebar={sidebar} />
    </div>
  )
}
