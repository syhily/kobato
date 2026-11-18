import { listingHeaders } from '@kobato/server/http/route-cache-headers.ts'
import { createSsrCaller, unwrapListingPayload } from '@kobato/server/http/ssr-caller.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { CategoriesBody } from '@kobato/web-public/ui/post/CategoriesBody.tsx'
import { data } from 'react-router'

import { titleMeta } from '@/seo/title-meta.ts'

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
