import type { ZodType } from 'zod'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DRAFT_STORAGE_VERSION,
  getDraft,
  removeDraft,
  removeDraftsByPrefix,
  setDraft,
  type DraftRecord,
  type DraftType,
} from '@/ui/editor-shell/drafts/draft-store'

export function draftEditKey(keyPrefix: string, entityId: string, clientRevisionToken: string): string {
  return `${keyPrefix}${entityId}:${clientRevisionToken}`
}

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

export interface UseDraftSessionArgs<TBody, TLoaded> {
  key: string | null
  clearPrefix?: string
  broadcastName: string
  draftType: DraftType
  bodySchema: ZodType<TBody>
  body: TBody
  meta?: unknown
  mapLoaded: (record: DraftRecord, parsedBody: TBody) => TLoaded | null
}

export interface UseDraftSessionResult<TLoaded> {
  loadedDraft: TLoaded | null
  clearDraft: () => void
}

export function useDraftSession<TBody, TLoaded>({
  key,
  clearPrefix,
  broadcastName,
  draftType,
  bodySchema,
  body,
  meta,
  mapLoaded,
}: UseDraftSessionArgs<TBody, TLoaded>): UseDraftSessionResult<TLoaded> {
  const [loadedDraft, setLoadedDraft] = useState<TLoaded | null>(null)
  const lastReadKeyRef = useRef<string | null>(null)
  const loadCompleteRef = useRef(false)

  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    if (key === null) {
      setLoadedDraft(null)
    }
  }

  useEffect(() => {
    if (key === null) {
      lastReadKeyRef.current = null
      loadCompleteRef.current = false
      return
    }
    if (lastReadKeyRef.current === key) {
      return
    }
    lastReadKeyRef.current = key
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
        if (record.version !== DRAFT_STORAGE_VERSION) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        const bodyResult = bodySchema.safeParse(record.body)
        if (!bodyResult.success) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        const mapped = mapLoaded(record, bodyResult.data)
        if (mapped === null) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        setLoadedDraft(mapped)
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
  }, [key, bodySchema, mapLoaded])

  useEffect(() => {
    if (key === null) {
      return
    }
    if (!loadCompleteRef.current) {
      return
    }
    const payload: DraftRecord<TBody> = {
      key,
      type: draftType,
      body,
      ...(meta !== undefined ? { meta } : {}),
      savedAt: Date.now(),
      version: DRAFT_STORAGE_VERSION,
    }

    let cancelled = false

    void (async () => {
      try {
        if (!cancelled) {
          await setDraft(key, payload)
        }
      } catch {}
    })()

    return () => {
      cancelled = true
    }
  }, [key, body, meta, draftType])

  useEffect(() => {
    if (key === null) {
      return
    }
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(broadcastName)
      bc.addEventListener('message', (event: MessageEvent<BroadcastMessage>) => {
        if (event.data?.kind === 'cleared' && event.data.key === key) {
          setLoadedDraft(null)
        }
      })
    } catch {}
    return () => {
      bc?.close()
    }
  }, [key, broadcastName])

  const clearDraft = useCallback(() => {
    if (key === null) {
      return
    }
    if (clearPrefix !== undefined) {
      void removeDraftsByPrefix(clearPrefix)
    } else {
      void removeDraft(key)
    }
    setLoadedDraft(null)
    try {
      const bc = new BroadcastChannel(broadcastName)
      const msg: BroadcastMessage = { kind: 'cleared', key }
      bc.postMessage(msg)
      bc.close()
    } catch {}
  }, [key, clearPrefix, broadcastName])

  return { loadedDraft, clearDraft }
}
