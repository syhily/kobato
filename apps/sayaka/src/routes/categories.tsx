import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { titleMeta } from '@sayaka/seo/title-meta'
import { getSayakaContext } from '@sayaka/server/request-context'
import { listingHeaders } from '@sayaka/server/route-cache-headers'
import { sinkUnhandledRejection, unwrapListingPayload } from '@sayaka/server/unwrap'
import { CategoriesBody } from '@sayaka/ui/post/CategoriesBody'
import { data } from 'react-router'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })
  const payloadPromise = sinkUnhandledRejection(
    ctx.client.public.content.categories.list({
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    }),
  )
  const boot = await ctx.bootstrap()
  const { etag, payload } = await unwrapListingPayload(payloadPromise, boot.i18n.locale)
  return data({ ...payload, eid: ctx.analyticsEventId }, { headers: { ETag: etag } })
}

export const headers = listingHeaders

export const meta = titleMeta('meta.title.public.categories')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  return <CategoriesBody title={t('public.categories.title')} categories={loaderData.categories} />
}
