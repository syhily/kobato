import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { LoaderFunctionArgs } from 'react-router'

import type { EntityTarget } from '@/server/infra/db/target'
import type { DetailPageComments } from '@/shared/types/comments'

import { trackAccess } from '@/server/domains/analytics/track'
import { tryGetRequestContext, tryGetSessionContext } from '@/server/domains/auth/context'
import { resolveSessionContext, userSession } from '@/server/domains/auth/primitives'
import { loadDetailPageStreaming } from '@/server/http/loaders/comments'

export type PublicDetailCritical = Awaited<ReturnType<typeof loadDetailPageStreaming>>['critical']

// `comments` rides as a Promise so the route can stream it through
// React Router's `<Await>` boundary while the critical body renders.
// (`react-router-framework-mode/data-loading/data-loading` "Streaming with defer".)
export interface PublicDetailData extends PublicDetailCritical {
  comments: Promise<DetailPageComments>
}

function isPrefetchRequest(request: Request): boolean {
  const purpose = request.headers.get('Purpose') ?? request.headers.get('Sec-Purpose')
  return purpose?.toLowerCase().includes('prefetch') ?? false
}

export async function loadPublicDetailData(
  db: NodePgDatabase,
  {
    request,
    context,
    target,
  }: Pick<LoaderFunctionArgs, 'request' | 'context'> & {
    target: EntityTarget
  },
): Promise<{ detail: PublicDetailData }> {
  const sessionContext = tryGetSessionContext(context) ?? (await resolveSessionContext(db, request))
  const { session } = sessionContext
  const trackView = !isPrefetchRequest(request)
  const isAdmin = userSession(session)?.role === 'admin'

  // Append-only access-log write for the analytics dashboard. Lives
  // alongside (not inside) the existing `bumpPageView` flow: the
  // counter increment happens via `loadDetailPageCritical` (called
  // from `loadDetailPageStreaming` below), the time-series write
  // happens here. The admin-exemption (matching `bumpPageView`'s)
  // and the analytics settings override both live inside
  // `trackAccess`. `void`d — never blocks the loader.
  if (trackView) {
    const reqCtx = tryGetRequestContext(context)
    void trackAccess(request, target, { isAdmin, clientAddress: reqCtx?.clientAddress })
  }

  const streaming = await loadDetailPageStreaming(db, session, target, { trackView })

  return {
    detail: { ...streaming.critical, comments: streaming.comments },
  }
}
