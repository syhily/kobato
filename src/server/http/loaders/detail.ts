import type { HandlerContext } from '@/server/http/orpc-base'
import type { EntityTarget } from '@/server/infra/db/target'
import type { DetailCriticalPayload } from '@/shared/contracts/content'

import { trackPageView } from '@/server/domains/analytics/track'
import { loadDetailPageCritical } from '@/server/http/loaders/comments'

// The detail critical orchestrator for `content.posts/pages.bySlug`:
// analytics tracking + the above-the-fold payload (comment key, likes,
// current-user identity, sidebar). Comments stream separately via `<Await>`.
export async function loadPublicDetailData(
  context: HandlerContext,
  target: EntityTarget,
): Promise<DetailCriticalPayload> {
  // Both analytics signals from the single domain entry point — the view
  // gate lives inside `trackPageView`; the loader never re-reads headers. `void`d.
  void trackPageView(context.requestFacts, target, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })

  return loadDetailPageCritical(context.db, context.session, target)
}
