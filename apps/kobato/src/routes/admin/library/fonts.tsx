import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { FontsView } from '@kobato/web/ui/admin/fonts/FontsView.tsx'

// Self-hosted web-font library and slot assignment, managed outside the settings autosave framework (slot
// changes call `admin.fonts.setSlot` directly and revalidate). Data is fetched client-side via oRPC.
export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.fonts')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
