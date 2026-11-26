import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { FontsView } from '@/ui/fonts/FontsView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.fonts')

export default function AdminLibraryFontsRoute() {
  return <FontsView />
}
