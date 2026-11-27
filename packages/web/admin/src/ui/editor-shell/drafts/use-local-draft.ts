import type { DraftRecord, DraftType } from '@kobato/web-admin/ui/editor-shell/drafts/draft-store'
import type { ZodType } from 'zod'

import { draftEditKey, useDraftSession } from '@kobato/web-admin/ui/editor-shell/drafts/draft-session'
import { useCallback } from 'react'

export interface LocalDraftConfig<TBody> {
  keyPrefix: string
  broadcastName: string
  editType: DraftType
  bodySchema: ZodType<TBody>
}

export interface StoredDraft<TBody> {
  version: number
  entityId: string
  clientRevisionToken: string
  body: TBody
  savedAt: number
}

export interface UseLocalDraftOptions<TBody> {
  entityId: string | null
  clientRevisionToken: string | null
  body: TBody
  disabled?: boolean
}

export interface UseLocalDraftResult<TBody> {
  loadedDraft: StoredDraft<TBody> | null
  clearDraft: () => void
}

export function useLocalDraft<TBody>(
  config: LocalDraftConfig<TBody>,
  { entityId, clientRevisionToken, body, disabled = false }: UseLocalDraftOptions<TBody>,
): UseLocalDraftResult<TBody> {
  const key =
    !disabled && entityId !== null && clientRevisionToken !== null
      ? draftEditKey(config.keyPrefix, entityId, clientRevisionToken)
      : null

  const mapLoaded = useCallback(
    (record: DraftRecord, parsedBody: TBody): StoredDraft<TBody> | null =>
      entityId === null || clientRevisionToken === null
        ? null
        : {
            version: record.version,
            entityId,
            clientRevisionToken,
            body: parsedBody,
            savedAt: record.savedAt,
          },
    [entityId, clientRevisionToken],
  )

  const { loadedDraft, clearDraft } = useDraftSession<TBody, StoredDraft<TBody>>({
    key,
    clearPrefix: entityId === null ? undefined : `${config.keyPrefix}${entityId}:`,
    broadcastName: config.broadcastName,
    draftType: config.editType,
    bodySchema: config.bodySchema,
    body,
    mapLoaded,
  })

  return { loadedDraft, clearDraft }
}
