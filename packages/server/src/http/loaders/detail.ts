import type { RequestContext } from '@kobato/server/http/request-context'
import type { Database } from '@kobato/server/infra/db/database'
import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { PublicWebmentionWire } from '@kobato/shared/contracts/webmentions'
import type { DetailPageComments } from '@kobato/shared/types/comments'

import { trackPageView } from '@kobato/server/domains/analytics/track'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service'
import { loadDetailPageStreaming } from '@kobato/server/http/loaders/comments'

export type PublicDetailCritical = Awaited<ReturnType<typeof loadDetailPageStreaming>>['critical']

// `comments` and `webmentions` ride as Promises so the route can stream
// them through React Router `<Await>` boundaries while the critical body
// renders. (`react-router-framework-mode/data-loading/data-loading`
// "Streaming with defer".)
export interface PublicDetailData extends PublicDetailCritical {
  comments: Promise<DetailPageComments>
  webmentions: Promise<PublicWebmentionWire[]>
}

export async function loadPublicDetailData(
  db: Database,
  rc: RequestContext,
  target: EntityTarget,
): Promise<{ detail: PublicDetailData }> {
  const { session } = rc

  // Both analytics signals (counter + time-series) from the single
  // domain entry point. The whole "counts as a view" gate — prefetch via
  // `rc.requestFacts.purpose`, admin exemption with the analytics
  // settings override, bot handling — lives inside `trackPageView`; the
  // loader passes the already-derived facts and never re-reads headers.
  // `void`d — never blocks the loader.
  void trackPageView(rc.requestFacts, target, {
    isAdmin: rc.viewer?.role === 'admin',
    clientAddress: rc.clientAddress,
  })

  const streaming = await loadDetailPageStreaming(db, session, target)

  // Approved mentions only, with both display switches (global setting
  // AND the per-entity meta toggle) resolved by the shared domain entry
  // point to an honest empty list — the same function the
  // `public.webmention.list` procedure wraps, so the headless API and
  // the SSR loader can never drift apart.
  const webmentions = loadPublicWebmentionsForTarget(db, target)

  return {
    detail: { ...streaming.critical, comments: streaming.comments, webmentions },
  }
}
