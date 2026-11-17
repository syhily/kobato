import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { PagesView } from '@kobato/web/ui/admin/pages/PagesView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.pages')

export default function WpAdminPagesRoute() {
  return <PagesView />
}
