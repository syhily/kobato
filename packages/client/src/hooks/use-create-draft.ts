import type { ZodType } from 'zod'

import { DRAFT_STORAGE_VERSION, draftEditKey, useDraftSession } from '@kobato/client/lib/draft-session'
import { removeDraft, setDraft, type DraftRecord, type DraftType } from '@kobato/client/lib/draft-store'
import { useCallback, useState } from 'react'

export interface CreateDraftConfig<TBody> {
  keyPrefix: string
  sessionKey: string
  broadcastName: string
  createType: DraftType
  editType: DraftType
  editKeyPrefix: string
  bodySchema: ZodType<TBody>
}

function readOrCreateSessionId(sessionKey: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  try {
    const existing = window.sessionStorage.getItem(sessionKey)
    if (existing !== null && existing !== '') {
      return existing
    }
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    window.sessionStorage.setItem(sessionKey, fresh)
    return fresh
  } catch {
    return Date.now().toString(36)
  }
}

// A stored create draft is only usable when it carries meta. The draft
// session has already version- and schema-checked the record by the time
// this runs, so the predicate only adds the meta check.
function hasMeta<TBody, TMeta>(record: DraftRecord): record is DraftRecord<TBody, TMeta> & { meta: TMeta } {
  return record.meta !== undefined
}

export interface UseCreateDraftOptions<TBody, TMeta> {
  body: TBody
  meta: TMeta
}

export interface UseCreateDraftResult<TBody, TMeta> {
  sessionId: string
  loadedDraft: { body: TBody; meta: TMeta; savedAt: number } | null
  migrateToEditKey: (entityId: string, clientRevisionToken: string, body: TBody) => void
  clearDraft: () => void
}

export function useCreateDraft<TBody, TMeta>(
  config: CreateDraftConfig<TBody>,
  { body, meta }: UseCreateDraftOptions<TBody, TMeta>,
): UseCreateDraftResult<TBody, TMeta> {
  const [sessionId] = useState(() => readOrCreateSessionId(config.sessionKey))
  const key = `${config.keyPrefix}${sessionId}`

  // The draft lifecycle lives in useDraftSession; this adapter only supplies
  // the session key and the meta-carrying mapping. Note the raw record body
  // is surfaced, not the parsed one — historical create-flow behavior.
  const mapLoaded = useCallback((record: DraftRecord): { body: TBody; meta: TMeta; savedAt: number } | null => {
    if (!hasMeta<TBody, TMeta>(record)) {
      return null
    }
    return { body: record.body, meta: record.meta, savedAt: record.savedAt }
  }, [])

  const { loadedDraft, clearDraft } = useDraftSession<TBody, { body: TBody; meta: TMeta; savedAt: number }>({
    key,
    broadcastName: config.broadcastName,
    draftType: config.createType,
    bodySchema: config.bodySchema,
    body,
    meta,
    mapLoaded,
  })

  const migrateToEditKey = useCallback(
    (entityId: string, clientRevisionToken: string, latestBody: TBody) => {
      const editKey = draftEditKey(config.editKeyPrefix, entityId, clientRevisionToken)
      const editPayload: DraftRecord<TBody> = {
        key: editKey,
        type: config.editType,
        body: latestBody,
        savedAt: Date.now(),
        version: DRAFT_STORAGE_VERSION,
      }
      void (async () => {
        try {
          await setDraft(editKey, editPayload)
          await removeDraft(key)
          window.sessionStorage.removeItem(config.sessionKey)
        } catch {
          // Ignore.
        }
      })()
    },
    [key, config.sessionKey, config.editKeyPrefix, config.editType],
  )

  return {
    sessionId,
    loadedDraft,
    migrateToEditKey,
    clearDraft,
  }
}
