import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { FontsView } from '@kobato/web-admin/ui/fonts/FontsView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.fonts')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
