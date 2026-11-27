import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { CategoriesView } from '@kobato/web-admin/ui/categories/CategoriesView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.categories')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
