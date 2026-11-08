import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PagesView } from '@/ui/admin/pages/PagesView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.pages')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
