import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PagesView } from '@/ui/pages/PagesView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.pages')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
