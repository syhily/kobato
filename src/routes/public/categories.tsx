import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { CategoriesBody } from '@/ui/public/post/CategoriesBody'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  return caller.content.categories.list()
}

export const headers = listingHeaders

export const meta = titleMeta('分类')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  return <CategoriesBody title="分类" categories={loaderData.categories} />
}
