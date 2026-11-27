import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PagesView } from '@kobato/web-admin/ui/pages/PagesView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.pages')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
