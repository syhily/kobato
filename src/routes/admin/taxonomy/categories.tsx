import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.admin.categories')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
