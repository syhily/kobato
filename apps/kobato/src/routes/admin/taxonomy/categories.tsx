import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { CategoriesView } from '@kobato/web-admin/ui/categories/CategoriesView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.categories')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
