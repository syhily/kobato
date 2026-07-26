import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'
import type { authorProc } from '@/server/http/orpc-base'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { previewBody, saveBody } from '@/server/domains/content/lifecycle'
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
   * Whether `saveBody` receives `context.viewer` so the adapter's access
   * gate can evaluate ownership. Posts pass it: authors may only edit
   * their own posts (`assertOwnPostOr404`). Pages deliberately do NOT:
   * page editing is already admin-only via the `adminProc` gate, so the
   * page adapter's assert has no ownership rule to evaluate and the
   * viewer would be dead weight.
   */
  passViewerToSaveBody: boolean
}

/**
 * The save-draft / publish-latest / preview trio shared by the admin
 * posts and pages controllers. NOT_FOUND surfaces one way here: the
 * adapter's `assertAccess` throws a `DomainError`, which the
 * `domainErrorGuard` middleware in `orpc-base` translates to
 * `ORPCError('NOT_FOUND')` — the handlers never throw `ORPCError`
 * directly.
 */
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
      return previewBody(input.body, (body) => renderPortableTextToHtml(context.db, body, []))
    })

  return { saveDraft, publishLatest, preview }
}
