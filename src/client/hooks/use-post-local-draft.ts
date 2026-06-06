import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'

import { getDraft, removeDraft, setDraft, type DraftRecord } from '@/client/lib/draft-store'

// IndexedDB draft persistence for the post editor.
// Key: `cms-post-draft:<postId>:<clientRevisionToken>`.
// Binds to the revision token so conflict resolution starts a clean slot.
// Cross-tab clear sync uses `BroadcastChannel` (with Safari fallback).

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'cms-post-draft:'
const BROADCAST_NAME = 'cms-post-draft'

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

interface StoredDraft {
  version: number
  postId: string
  clientRevisionToken: string
  body: PortableTextBody
  savedAt: number
}

export interface UsePostLocalDraftOptions {
  postId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  /** Inert while the editor is in `create` mode with no `postId`. */
  disabled?: boolean
}

export interface UsePostLocalDraftResult {
  loadedDraft: StoredDraft | null
  clearDraft: () => void
}

export function usePostLocalDraft({
  postId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePostLocalDraftOptions): UsePostLocalDraftResult {
  // Loaded once at mount per key so saves don't re-trigger the "found older draft" prompt.
  const [loadedDraft, setLoadedDraft] = useState<StoredDraft | null>(null)
  const lastReadKeyRef = useRef<string | null>(null)
  const loadCompleteRef = useRef(false)

  const key =
    !disabled && postId !== null && clientRevisionToken !== null
      ? `${STORAGE_KEY_PREFIX}${postId}:${clientRevisionToken}`
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
        setLoadedDraft(record as unknown as StoredDraft) // type retained via IDB structured clone
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
    if (key === null || postId === null || clientRevisionToken === null) {
      return
    }
    if (!loadCompleteRef.current) {
      return
    }
    const payload: DraftRecord<PortableTextBody> = {
      key,
      type: 'post-edit',
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
  }, [key, postId, clientRevisionToken, body])

  // Cross-tab sync: react when this key is cleared elsewhere.
  useEffect(() => {
    if (key === null) {
      return
    }
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(BROADCAST_NAME)
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
  }, [key])

  const clearDraft = useCallback(() => {
    if (key === null) {
      return
    }
    void removeDraft(key)
    setLoadedDraft(null)
    try {
      const bc = new BroadcastChannel(BROADCAST_NAME)
      const msg: BroadcastMessage = { kind: 'cleared', key }
      bc.postMessage(msg)
      bc.close()
    } catch {
      // Ignore.
    }
  }, [key])

  return { loadedDraft, clearDraft }
}

export type { StoredDraft }
