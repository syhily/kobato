import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { PagesView } from '@kobato/web-admin/ui/pages/PagesView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.pages')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
