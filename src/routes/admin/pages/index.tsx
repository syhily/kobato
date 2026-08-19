import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PagesView } from '@/ui/admin/pages/PagesView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('页面管理')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
