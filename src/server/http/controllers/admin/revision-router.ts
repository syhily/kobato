import type { ContentEntityAdapter, SaveBodyOutcome, SaveBodyResult } from '@/server/domains/content/lifecycle'
import type { authorProc, HandlerContext } from '@/server/http/orpc-base'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { saveBody } from '@/server/domains/content/lifecycle'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { formatWarningDescriptors } from '@/server/http/translate-domain-error'
import { createServerTranslator } from '@/server/infra/i18n'
import { saveBodyInput, saveResultOutput } from '@/shared/contracts/revision'
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

/** Localize the non-fatal side-effect notices for the request locale. */
function localizeSaveResult(result: SaveBodyOutcome, context: HandlerContext): SaveBodyResult {
  const { warningDescriptors, ...rest } = result
  const warning = formatWarningDescriptors(warningDescriptors, createServerTranslator(context.localization.locale))
  return warning === undefined ? rest : { ...rest, warning }
}

/** The save-draft / publish-latest pair shared by the posts and pages
 *  controllers. NOT_FOUND surfaces via the adapter's `assertAccess`. */
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
      return localizeSaveResult(result, context)
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
      return localizeSaveResult(result, context)
    })

  return { saveDraft, publishLatest }
}
