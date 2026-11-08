import type { HandlerContext } from '@/server/http/orpc-base'
import type { EntityTarget } from '@/server/infra/db/target'
import type { DetailCriticalPayload } from '@/shared/contracts/content'

import { trackPageView } from '@/server/domains/analytics/track'
import { loadDetailPageCritical } from '@/server/http/loaders/comments'

// The detail critical orchestrator for `content.posts/pages.bySlug`: the
// above-the-fold payload (comment key, likes, current-user identity, sidebar).
// It is loaded BEFORE the ETag comparison — a 304 may only be answered once
// every field of the representation (including likes) is known.
export async function loadDetailCritical(
  context: HandlerContext,
  target: EntityTarget,
): Promise<DetailCriticalPayload> {
  return loadDetailPageCritical(
    context.db,
    context.session,
    target,
    context.settings,
    context.localization.revisions.comments,
  )
}

// Both analytics signals from the single domain entry point — the view gate
// lives inside `trackPageView`; the loader never re-reads headers. Called only
// after revalidation settles, so a 304 never records a page view.
export function trackDetailPageView(context: HandlerContext, target: EntityTarget): void {
  trackPageView(context.requestFacts, target, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })
}
