import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'
import type { authorProc } from '@/server/http/orpc-base'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { previewBody, saveBody } from '@/server/domains/content/lifecycle'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { renderPortableTextToHtml } from '@/server/render/pt-html'
import { previewBodyInput, previewOutputDto, saveBodyInput, saveResultOutput } from '@/shared/contracts/revision'
import { idFromString } from '@/shared/utils/id'

export interface RevisionRouterAudit {
  resourceType: string
  draftSavedAction: string
  publishedAction: string
}

export interface MakeRevisionRouterOptions<TMeta, TPreview> {
  /** Base procedure carrying the role gate: posts use `authorProc` (author+), pages `adminProc`. */
  proc: typeof authorProc
  adapter: ContentEntityAdapter<TMeta, TPreview>
  /** Route prefix, e.g. `/admin/posts` — procedures mount at `${basePath}/save-draft` etc. */
  basePath: `/${string}`
  audit: RevisionRouterAudit
  /**
   * Whether `saveBody` receives `context.viewer` so the adapter's access gate
   * can evaluate ownership — posts pass it, pages (admin-only) don't.
   */
  passViewerToSaveBody: boolean
}

/** The save-draft / publish-latest / preview trio shared by the posts and
 *  pages controllers. NOT_FOUND surfaces via the adapter's `assertAccess`. */
export function makeRevisionRouter<TMeta, TPreview>(options: MakeRevisionRouterOptions<TMeta, TPreview>) {
  const { proc, adapter, basePath, audit, passViewerToSaveBody } = options

  const saveDraft = proc
    .route({ method: 'POST', path: `${basePath}/save-draft` })
    .input(saveBodyInput)
    .output(saveResultOutput)
    .handler(async ({ input, context }) => {
      const result = await saveBody(
        context.db,
        adapter,
        {
          entityId: idFromString(input.id),
          body: input.body,
          resolveMusicEmbeds: (playerIds) => getPublicMusicMetasByIds(context.db, playerIds),
          expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
          force: input.force,
          authorId: idFromString(context.viewer.id),
        },
        'draft',
        passViewerToSaveBody ? context.viewer : undefined,
      )
      if (result.status === 'saved') {
        recordAuditEventFromContext(context, {
          action: audit.draftSavedAction,
          resourceType: audit.resourceType,
          resourceId: input.id,
        })
      }
      return result
    })

  const publishLatest = proc
    .route({ method: 'POST', path: `${basePath}/publish-latest` })
    .input(saveBodyInput)
    .output(saveResultOutput)
    .handler(async ({ input, context }) => {
      const result = await saveBody(
        context.db,
        adapter,
        {
          entityId: idFromString(input.id),
          body: input.body,
          resolveMusicEmbeds: (playerIds) => getPublicMusicMetasByIds(context.db, playerIds),
          expectedClientRevisionToken: input.expectedClientRevisionToken ?? undefined,
          force: input.force,
          authorId: idFromString(context.viewer.id),
          publishedAt: input.publishedAt !== undefined ? new Date(input.publishedAt) : undefined,
        },
        'publish',
        passViewerToSaveBody ? context.viewer : undefined,
      )
      if (result.status === 'saved') {
        recordAuditEventFromContext(context, {
          action: audit.publishedAction,
          resourceType: audit.resourceType,
          resourceId: input.id,
          details: { publishedAt: input.publishedAt },
        })
      }
      return result
    })

  const preview = proc
    .route({ method: 'POST', path: `${basePath}/preview` })
    .input(previewBodyInput)
    .output(previewOutputDto)
    .handler(({ input, context }) => {
      return previewBody(input.body, (body) =>
        renderPortableTextToHtml(body, [], (playerIds) => getPublicMusicMetasByIds(context.db, playerIds)),
      )
    })

  return { saveDraft, publishLatest, preview }
}
