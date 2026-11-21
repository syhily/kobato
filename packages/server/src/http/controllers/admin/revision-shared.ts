import type { RevisionContract } from '@kobato/api/rpc/admin/revision'
import type { ContentEntityAdapter, SaveBodyOutcome, SaveBodyResult } from '@kobato/server/domains/content/lifecycle'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { saveBody } from '@kobato/server/domains/content/lifecycle'
import { getPublicMusicMetasByIds } from '@kobato/server/domains/music/services/read'
import { implementAuthor } from '@kobato/server/http/orpc-base'
import { formatWarningDescriptors } from '@kobato/server/http/translate-domain-error'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { idFromString } from '@kobato/utils/id'

export interface RevisionRouterAudit {
  resourceType: string
  draftSavedAction: string
  publishedAction: string
}

const revisionImplementer = implementAuthor<RevisionContract>
type RevisionRouterImplementer = Pick<ReturnType<typeof revisionImplementer>, 'saveDraft' | 'publishLatest'>

export interface MakeRevisionRouterOptions<TMeta, TPreview> {
  impl: RevisionRouterImplementer
  adapter: ContentEntityAdapter<TMeta, TPreview>
  audit: RevisionRouterAudit
  passViewerToSaveBody: boolean
}

function localizeSaveResult(result: SaveBodyOutcome, context: HandlerContext): SaveBodyResult {
  const { warningDescriptors, ...rest } = result
  const warning = formatWarningDescriptors(warningDescriptors, createServerTranslator(context.localization.locale))
  return warning === undefined ? rest : { ...rest, warning }
}

export function makeRevisionRouter<TMeta, TPreview>(options: MakeRevisionRouterOptions<TMeta, TPreview>) {
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
