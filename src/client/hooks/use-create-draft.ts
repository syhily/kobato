import type { ZodType } from 'zod'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getDraft, removeDraft, setDraft, type DraftRecord, type DraftType } from '@/client/lib/draft-store'

export interface CreateDraftConfig<TBody> {
  keyPrefix: string
  sessionKey: string
  broadcastName: string
  createType: DraftType
  editType: DraftType
  editKeyPrefix: string
  bodySchema: ZodType<TBody>
}

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

const STORAGE_VERSION = 1

function isValidDraft<TBody, TMeta>(
  record: DraftRecord,
  config: CreateDraftConfig<TBody>,
): record is DraftRecord<TBody, TMeta> & { meta: TMeta } {
  return (
    record.version === STORAGE_VERSION && config.bodySchema.safeParse(record.body).success && record.meta !== undefined
  )
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

  const [loadedDraft, setLoadedDraft] = useState<{ body: TBody; meta: TMeta; savedAt: number } | null>(null)
  const didReadRef = useRef(false)
  const loadCompleteRef = useRef(false)

  useEffect(() => {
    if (didReadRef.current) {
      return
    }
    didReadRef.current = true
    loadCompleteRef.current = false

    let cancelled = false

    void (async () => {
      try {
        const record = await getDraft(key)
        if (cancelled) {
          return
        }
        if (record === null) {
          setLoadedDraft(null)
          loadCompleteRef.current = true
          return
        }
        if (!isValidDraft<TBody, TMeta>(record, config)) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        setLoadedDraft({
          body: record.body,
          meta: record.meta,
          savedAt: record.savedAt,
        })
        loadCompleteRef.current = true
      } catch {
        if (!cancelled) {
          setLoadedDraft(null)
        }
        loadCompleteRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, config])

  useEffect(() => {
    if (!loadCompleteRef.current) {
      return
    }
    const payload: DraftRecord<TBody, TMeta> = {
      key,
      type: config.createType,
      body,
      meta,
      savedAt: Date.now(),
      version: STORAGE_VERSION,
    }

    let cancelled = false

    void (async () => {
      try {
        if (!cancelled) {
          await setDraft(key, payload)
        }
      } catch {
        // Quota or disabled storage — silently ignore.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, body, meta, config.createType])

  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(config.broadcastName)
      bc.addEventListener('message', (event: MessageEvent<BroadcastMessage>) => {
        if (event.data?.kind === 'cleared' && event.data.key === key) {
          setLoadedDraft(null)
        }
      })
    } catch {
      // BroadcastChannel unavailable (older Safari).
    }
    return () => {
      bc?.close()
    }
  }, [key, config.broadcastName])

  const clearDraft = useCallback(() => {
    void removeDraft(key)
    setLoadedDraft(null)
    try {
      const bc = new BroadcastChannel(config.broadcastName)
      const msg: BroadcastMessage = { kind: 'cleared', key }
      bc.postMessage(msg)
      bc.close()
    } catch {
      // Ignore.
    }
  }, [key, config.broadcastName])

  const migrateToEditKey = useCallback(
    (entityId: string, clientRevisionToken: string, latestBody: TBody) => {
      const editKey = `${config.editKeyPrefix}${entityId}:${clientRevisionToken}`
      const editPayload: DraftRecord<TBody> = {
        key: editKey,
        type: config.editType,
        body: latestBody,
        savedAt: Date.now(),
        version: STORAGE_VERSION,
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
