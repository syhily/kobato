import { listingHeaders } from '@kobato/shared/http/headers'
import { titleMeta } from '@kobato/shared/seo/title-meta'
import { CategoriesBody } from '@kobato/ui/public/post/CategoriesBody'

import { getFrontendContext } from '@/lib/frontend-context'

import type { Route } from './+types/categories'

import { getPublicClient } from './client'

export async function loader({ request, context }: Route.LoaderArgs) {
  const fctx = getFrontendContext({ request, context })
  return getPublicClient(fctx).allCategories({})
}

export const headers = listingHeaders

export const meta = titleMeta('分类')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  return <CategoriesBody title="分类" categories={loaderData.categories} />
}
