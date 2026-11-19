import type { DetailCriticalPayload } from '@kobato/contracts/content.ts'
import type { EntityTarget } from '@kobato/db/target.ts'
import type { HandlerContext } from '@kobato/server/http/orpc-base.ts'

import { trackPageView } from '@kobato/server/domains/analytics/track.ts'
import { loadDetailPageCritical } from '@kobato/server/http/loaders/comments.ts'

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
