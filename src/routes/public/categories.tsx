import { data } from 'react-router'

import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller, unwrapListingPayload } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { useI18n } from '@/ui/lib/I18nProvider'
import { CategoriesBody } from '@/ui/public/post/CategoriesBody'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, analyticsEventId, localization } = createSsrCaller({ request, context })
  const { etag, payload } = await unwrapListingPayload(
    caller.content.categories.list({ ifNoneMatch: request.headers.get('if-none-match') ?? undefined }),
    localization,
  )
  return data({ ...payload, eid: analyticsEventId }, { headers: { ETag: etag } })
}

export const headers = listingHeaders

export const meta = titleMeta('meta.title.public.categories')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  return <CategoriesBody title={t('public.categories.title')} categories={loaderData.categories} />
}
