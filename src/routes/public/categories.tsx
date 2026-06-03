import { getDbFromContext } from '@/server/domains/auth/context'
import { listAllCategories } from '@/server/domains/taxonomies/categories/services/query'
import { listingHeaders, publicShouldRevalidate } from '@/server/http/loaders/route-exports'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { CategoriesBody } from '@/ui/public/post/CategoriesBody'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDbFromContext({ request, context })
  const categories = await listAllCategories(db)
  return {
    categories,
  }
}

export const headers = listingHeaders
export const shouldRevalidate = publicShouldRevalidate

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '分类' }, bundleFromMatches(matches))
}

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  return <CategoriesBody title="分类" categories={loaderData.categories} />
}
