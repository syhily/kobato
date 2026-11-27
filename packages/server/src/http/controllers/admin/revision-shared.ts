import type { RevisionContract } from '@kobato/api/rpc/admin/revision'
import type { ContentEntityAdapter, SaveBodyOutcome, SaveBodyResult } from '@kobato/server/domains/content/lifecycle'
import type { ContractImplementer } from '@kobato/server/http/contract-implementation'
import type { AuthedHandlerContext, HandlerContext } from '@kobato/server/http/orpc-base'

import { idFromString } from '@kobato/base/utils/id'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { saveBody } from '@kobato/server/domains/content/lifecycle'
import { getPublicMusicMetasByIds } from '@kobato/server/domains/music/services/read'
import { formatWarningDescriptors } from '@kobato/server/http/translate-domain-error'
import { createServerTranslator } from '@kobato/server/infra/i18n'

export interface RevisionRouterAudit {
  resourceType: string
  draftSavedAction: string
  publishedAction: string
}

type RevisionRouterImplementer<TBase extends string> = Pick<
  ContractImplementer<RevisionContract<TBase>, HandlerContext, AuthedHandlerContext>,
  'saveDraft' | 'publishLatest'
>

export interface MakeRevisionRouterOptions<TBase extends string, TMeta, TPreview> {
  impl: RevisionRouterImplementer<TBase>
  adapter: ContentEntityAdapter<TMeta, TPreview>
  audit: RevisionRouterAudit
  passViewerToSaveBody: boolean
}

function localizeSaveResult(result: SaveBodyOutcome, context: HandlerContext): SaveBodyResult {
  const { warningDescriptors, ...rest } = result
  const warning = formatWarningDescriptors(warningDescriptors, createServerTranslator(context.localization.locale))
  return warning === undefined ? rest : { ...rest, warning }
}

export function makeRevisionRouter<TBase extends string, TMeta, TPreview>(
  options: MakeRevisionRouterOptions<TBase, TMeta, TPreview>,
) {
  const { impl, adapter, audit, passViewerToSaveBody } = options

  const saveDraft = impl.saveDraft.handler(async ({ input, context }) => {
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

  const publishLatest = impl.publishLatest.handler(async ({ input, context }) => {
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
