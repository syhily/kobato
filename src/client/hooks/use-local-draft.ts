import type { ZodType } from 'zod'

import { useCallback } from 'react'

import type { DraftRecord, DraftType } from '@/client/lib/draft-store'

import { draftEditKey, useDraftSession } from '@/client/lib/draft-session'

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

  // Lifecycle lives in useDraftSession; this adapter only supplies the
  // entity-keyed key and the loaded mapping.
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
    // The clear prefix is the stable `<keyPrefix><entityId>:` portion: the
    // key embeds the rotating revision token, so clearing by prefix also
    // sweeps orphaned drafts written under rotated-out tokens (audit P1-15).
    clearPrefix: entityId === null ? undefined : `${config.keyPrefix}${entityId}:`,
    broadcastName: config.broadcastName,
    draftType: config.editType,
    bodySchema: config.bodySchema,
    body,
    mapLoaded,
  })

  return { loadedDraft, clearDraft }
}
