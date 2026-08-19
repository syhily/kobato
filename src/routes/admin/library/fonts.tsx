import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { FontsView } from '@/ui/admin/fonts/FontsView'

// Self-hosted web-font library + slot assignment, managed outside the settings
// autosave framework (slot changes call `admin.fonts.setSlot` directly and
// revalidate). Data is fetched client-side via oRPC.
export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('网站字体')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
