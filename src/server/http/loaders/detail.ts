import type { HandlerContext } from '@/server/http/orpc-base'
import type { EntityTarget } from '@/server/infra/db/target'
import type { DetailCriticalPayload } from '@/shared/contracts/content'

import { trackPageView } from '@/server/domains/analytics/track'
import { loadDetailPageCritical } from '@/server/http/loaders/comments'

// The detail critical orchestrator for the `content.posts.bySlug` /
// `content.pages.bySlug` procedures: analytics tracking + the
// above-the-fold payload (comment key, likes, current-user identity,
// sidebar).
//
// Comments and webmentions are deliberately NOT loaded here — the route
// streams them through `content.comments.byKey` and `webmention.list`,
// chained off this payload's `commentKey`, so `<Await>` keeps progressive
// rendering. `PublicDetailData`'s old promise-carrying shape retired with
// the oRPC migration.
export async function loadPublicDetailData(
  context: HandlerContext,
  target: EntityTarget,
): Promise<DetailCriticalPayload> {
  // Both analytics signals (counter + time-series) from the single
  // domain entry point. The whole "counts as a view" gate — prefetch via
  // `requestFacts.purpose`, admin exemption with the analytics
  // settings override, bot handling — lives inside `trackPageView`; the
  // loader passes the already-derived facts and never re-reads headers.
  // `void`d — never blocks the loader.
  void trackPageView(context.requestFacts, target, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })

  return loadDetailPageCritical(context.db, context.session, target)
}
