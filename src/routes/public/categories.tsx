import { listingHeaders } from '@/server/http/loaders/route-exports'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { titleMeta } from '@/shared/seo/title-meta'
import { useI18n } from '@/ui/lib/I18nProvider'
import { CategoriesBody } from '@/ui/public/post/CategoriesBody'

import type { Route } from './+types/categories'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, analyticsEventId } = createSsrCaller({ request, context })
  return { ...(await caller.content.categories.list()), eid: analyticsEventId }
}

export const headers = listingHeaders

export const meta = titleMeta('meta.title.public.categories')

export default function CategoriesRoute({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n()
  return <CategoriesBody title={t('public.categories.title')} categories={loaderData.categories} />
}
