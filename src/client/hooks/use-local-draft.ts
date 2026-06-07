import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'

import { getDraft, removeDraft, setDraft, type DraftRecord, type DraftType } from '@/client/lib/draft-store'

export interface LocalDraftConfig {
  keyPrefix: string
  broadcastName: string
  editType: DraftType
}

export interface StoredDraft {
  version: number
  entityId: string
  clientRevisionToken: string
  body: PortableTextBody
  savedAt: number
}

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

export interface UseLocalDraftOptions {
  entityId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  disabled?: boolean
}

export interface UseLocalDraftResult {
  loadedDraft: StoredDraft | null
  clearDraft: () => void
}

const STORAGE_VERSION = 1

export function useLocalDraft(
  config: LocalDraftConfig,
  { entityId, clientRevisionToken, body, disabled = false }: UseLocalDraftOptions,
): UseLocalDraftResult {
  const [loadedDraft, setLoadedDraft] = useState<StoredDraft | null>(null)
  const lastReadKeyRef = useRef<string | null>(null)
  const loadCompleteRef = useRef(false)

  const key =
    !disabled && entityId !== null && clientRevisionToken !== null
      ? `${config.keyPrefix}${entityId}:${clientRevisionToken}`
      : null

  useEffect(() => {
    if (key === null) {
      setLoadedDraft(null)
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
        if (record.version !== STORAGE_VERSION || !Array.isArray(record.body)) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        setLoadedDraft(record as unknown as StoredDraft)
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
  }, [key])

  useEffect(() => {
    if (key === null || entityId === null || clientRevisionToken === null) {
      return
    }
    if (!loadCompleteRef.current) {
      return
    }
    const payload: DraftRecord<PortableTextBody> = {
      key,
      type: config.editType,
      body,
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
  }, [key, entityId, clientRevisionToken, body, config.editType])

  useEffect(() => {
    if (key === null) {
      return
    }
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
    if (key === null) {
      return
    }
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

  return { loadedDraft, clearDraft }
}
