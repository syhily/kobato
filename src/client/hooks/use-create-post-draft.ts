import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'

import { getDraft, removeDraft, setDraft, type DraftRecord } from '@/client/lib/draft-store'

// IndexedDB draft persistence for the **create** post flow.
// Keys on a per-tab `sessionId` since there's no server id yet.
// On first save the slot migrates to the canonical edit key.

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'cms-post-draft:new:'
const SESSION_KEY = 'cms-post-draft:new:session'
const BROADCAST_NAME = 'cms-post-draft'

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

export interface CreatePostDraftMeta {
  slug: string
  title: string
  summary: string
  cover: string
  og: string
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  visible: boolean
  pinned: boolean
  category: string
  tags: string[]
  alias: string[]
  publishedAt: string
}

interface StoredCreateDraft {
  version: number
  sessionId: string
  body: PortableTextBody
  meta: CreatePostDraftMeta
  savedAt: number
}

export interface UseCreatePostDraftOptions {
  body: PortableTextBody
  meta: CreatePostDraftMeta
}

export interface UseCreatePostDraftResult {
  sessionId: string
  loadedDraft: StoredCreateDraft | null
  migrateToEditKey: (postId: string, clientRevisionToken: string, body: PortableTextBody) => void
  clearDraft: () => void
}

function readOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing !== null && existing !== '') {
      return existing
    }
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    window.sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return Date.now().toString(36)
  }
}

export function useCreatePostDraft({ body, meta }: UseCreatePostDraftOptions): UseCreatePostDraftResult {
  const sessionIdRef = useRef<string>('')
  if (sessionIdRef.current === '') {
    sessionIdRef.current = readOrCreateSessionId()
  }
  const sessionId = sessionIdRef.current
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`

  const [loadedDraft, setLoadedDraft] = useState<StoredCreateDraft | null>(null)
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
        if (record.version !== STORAGE_VERSION || !Array.isArray(record.body) || record.meta === undefined) {
          await removeDraft(key)
          if (!cancelled) {
            setLoadedDraft(null)
          }
          loadCompleteRef.current = true
          return
        }
        setLoadedDraft(record as unknown as StoredCreateDraft)
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
    if (!loadCompleteRef.current) {
      return
    }
    const payload: DraftRecord<PortableTextBody, CreatePostDraftMeta> = {
      key,
      type: 'post-create',
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
  }, [key, body, meta])

  useEffect(() => {
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

  const migrateToEditKey = useCallback(
    (postId: string, clientRevisionToken: string, latestBody: PortableTextBody) => {
      const editKey = `cms-post-draft:${postId}:${clientRevisionToken}`
      const editPayload: DraftRecord<PortableTextBody> = {
        key: editKey,
        type: 'post-edit',
        body: latestBody,
        savedAt: Date.now(),
        version: STORAGE_VERSION,
      }
      void (async () => {
        try {
          await setDraft(editKey, editPayload)
          await removeDraft(key)
          window.sessionStorage.removeItem(SESSION_KEY)
        } catch {
          // Ignore.
        }
      })()
    },
    [key],
  )

  return {
    sessionId,
    loadedDraft,
    migrateToEditKey,
    clearDraft,
  }
}
