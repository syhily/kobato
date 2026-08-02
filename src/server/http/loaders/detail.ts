import type { LoaderFunctionArgs } from 'react-router'

import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { PublicWebmentionWire } from '@/shared/contracts/webmentions'
import type { DetailPageComments } from '@/shared/types/comments'

import { trackPageView } from '@/server/domains/analytics/track'
import { listPublicWebmentions } from '@/server/domains/webmentions/service'
import { loadDetailPageStreaming } from '@/server/http/loaders/comments'
import { getRequestContext } from '@/server/http/request-context'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'

export type PublicDetailCritical = Awaited<ReturnType<typeof loadDetailPageStreaming>>['critical']

// `comments` and `webmentions` ride as Promises so the route can stream
// them through React Router `<Await>` boundaries while the critical body
// renders. (`react-router-framework-mode/data-loading/data-loading`
// "Streaming with defer".)
export interface PublicDetailData extends PublicDetailCritical {
  comments: Promise<DetailPageComments>
  webmentions: Promise<PublicWebmentionWire[]>
}

/** The per-entity display switch (post/page meta `webmentions_enabled`).
 *  One PK read; a missing row answers false (block hidden) — safe
 *  default for a dangling target. */
async function isEntityWebmentionsEnabled(db: Database, target: EntityTarget): Promise<boolean> {
  if (target.type === 'post') {
    const rows = await db
      .select({ enabled: post.webmentionsEnabled })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0]?.enabled ?? false
  }
  const rows = await db
    .select({ enabled: page.webmentionsEnabled })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0]?.enabled ?? false
}

export async function loadPublicDetailData(
  db: Database,
  { request, context, target }: Pick<LoaderFunctionArgs, 'request' | 'context'> & { target: EntityTarget },
): Promise<{ detail: PublicDetailData }> {
  const rc = getRequestContext({ request, context })
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

  // Approved mentions only; the display switches (global setting AND
  // the per-entity meta toggle) resolve to an honest empty list so the
  // view never renders the block. The entity flag is only read when the
  // global switch is on.
  const webmentions =
    requireBlogSettingsSection('webmentions').webmention.displayOnPosts &&
    (await isEntityWebmentionsEnabled(db, target))
      ? listPublicWebmentions(db, target)
      : Promise.resolve([])

  return {
    detail: { ...streaming.critical, comments: streaming.comments, webmentions },
  }
}
