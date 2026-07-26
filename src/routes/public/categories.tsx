import { listAllCategories } from '@/server/domains/taxonomies/categories/services/query'
import { listingHeaders } from '@/server/http/loaders/route-exports'
import { getRequestContext } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { CategoriesBody } from '@/ui/public/post/CategoriesBody'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getRequestContext({ request, context })
  const categories = await listAllCategories(db)
  return {
    categories,
  }
}

export const headers = listingHeaders

export const meta = titleMeta('分类')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  return <CategoriesBody title="分类" categories={loaderData.categories} />
}
