import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { FontsView } from '@kobato/web-admin/ui/fonts/FontsView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.fonts')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
