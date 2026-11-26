import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { CategoriesView } from '@/ui/categories/CategoriesView'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.admin.categories')

export default function WpAdminCategoriesRoute() {
  return <CategoriesView />
}
