import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'

import { getDraft, removeDraft, setDraft, type DraftRecord } from '@/client/lib/draft-store'

// IndexedDB draft persistence for the page editor.
// Key: `cms-page-draft:<pageId>:<clientRevisionToken>`.
// Binds to the revision token so conflict resolution starts a clean slot.
// Cross-tab clear sync uses `BroadcastChannel` (with Safari fallback).

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'cms-page-draft:'
const BROADCAST_NAME = 'cms-page-draft'

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

interface StoredDraft {
  version: number
  pageId: string
  clientRevisionToken: string
  body: PortableTextBody
  savedAt: number
}

export interface UsePageLocalDraftOptions {
  pageId: string | null
  clientRevisionToken: string | null
  body: PortableTextBody
  /** Inert while the editor is in `create` mode with no `pageId`. */
  disabled?: boolean
}

export interface UsePageLocalDraftResult {
  loadedDraft: StoredDraft | null
  clearDraft: () => void
}

export function usePageLocalDraft({
  pageId,
  clientRevisionToken,
  body,
  disabled = false,
}: UsePageLocalDraftOptions): UsePageLocalDraftResult {
  // Loaded once at mount per key so saves don't re-trigger the "found older draft" prompt.
  const [loadedDraft, setLoadedDraft] = useState<StoredDraft | null>(null)
  const lastReadKeyRef = useRef<string | null>(null)

  const key =
    !disabled && pageId !== null && clientRevisionToken !== null
      ? `${STORAGE_KEY_PREFIX}${pageId}:${clientRevisionToken}`
      : null

  useEffect(() => {
    if (key === null) {
      setLoadedDraft(null)
      lastReadKeyRef.current = null
      return
    }
    if (lastReadKeyRef.current === key) {
      return
    }
    lastReadKeyRef.current = key

    let cancelled = false

    void (async () => {
      try {
        const record = await getDraft(key)
        if (cancelled) {
          return
        }
        if (record === null) {
          setLoadedDraft(null)
          return
        }
        if (record.version !== STORAGE_VERSION || !Array.isArray(record.body)) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          return
        }
        setLoadedDraft(record as unknown as StoredDraft)
      } catch {
        if (!cancelled) {
          setLoadedDraft(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (key === null || pageId === null || clientRevisionToken === null) {
      return
    }
    const payload: DraftRecord = {
      key,
      type: 'page-edit',
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
  }, [key, pageId, clientRevisionToken, body])

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
