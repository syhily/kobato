import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { CategoriesView } from '@kobato/web-admin/ui/categories/CategoriesView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.categories')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
