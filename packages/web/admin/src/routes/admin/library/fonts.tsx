import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { FontsView } from '@kobato/web-admin/ui/fonts/FontsView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.fonts')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
