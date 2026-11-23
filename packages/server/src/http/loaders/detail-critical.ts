import type { DetailCriticalPayload } from '@kobato/api/contracts/public/content'
import type { EntityTarget } from '@kobato/db/sqlite/target'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { trackPageView } from '@kobato/server/domains/analytics/track'
import { loadDetailPageCritical } from '@kobato/server/http/loaders/comments'

export async function loadDetailCritical(
  context: HandlerContext,
  target: EntityTarget,
): Promise<DetailCriticalPayload> {
  return loadDetailPageCritical(context.db, context.session, target, context.settings)
}

export function trackDetailPageView(context: HandlerContext, target: EntityTarget): void {
  trackPageView(context.requestFacts, target, {
    isAdmin: context.viewer?.role === 'admin',
    clientAddress: context.clientAddress,
  })
}
