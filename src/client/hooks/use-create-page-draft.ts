import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { PageMetaDraft } from '@/shared/types/pages'

// Local-Storage backed draft persistence for the **create** flow of
// the Page editor. Distinct from `usePageLocalDraft` — that one keys
// on the server-assigned page id + revision token, which is exactly
// what's missing while a new page hasn't been saved yet.
//
// **Goal**: the user can author a brand-new page without first being
// forced to fill the metadata form and click "create". Body + meta
// are mirrored into LS keyed on a per-tab `sessionId`; on first save
// the caller hands the slot the freshly-assigned page id and we
// migrate the LS slot to the canonical `cms-page-draft:<id>:<token>`
// key shape so the edit-mode hook picks it up seamlessly.
//
// **Key shape** `cms-page-draft:new:<sessionId>`
//
// **Versioning** every payload carries `version: 1`; mismatches drop
// the slot.

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'cms-page-draft:new:'
const SESSION_KEY = 'cms-page-draft:new:session'

export type CreateDraftMeta = PageMetaDraft

interface StoredCreateDraft {
  version: number
  sessionId: string
  body: PortableTextBody
  meta: PageMetaDraft
  savedAt: number
}

export interface UseCreatePageDraftOptions {
  body: PortableTextBody
  meta: PageMetaDraft
}

export interface UseCreatePageDraftResult {
  /** Stable per-tab session id used as the LS key suffix. */
  sessionId: string
  /** Loaded draft from a previous session, or null when no slot exists. */
  loadedDraft: StoredCreateDraft | null
  /**
   * Move the LS slot to a canonical edit-mode key shape so
   * `usePageLocalDraft` picks it up after the first save. Must be
   * called immediately before the navigation to `/edit` so the
   * server-side `clientRevisionToken` matches what's in LS.
   */
  migrateToEditKey: (pageId: string, clientRevisionToken: string, body: PortableTextBody) => void
  /** Drop the create slot. Used after a successful first save. */
  clearDraft: () => void
}

// Read once and memoise the session id so a single tab keeps writing
// to the same slot across re-mounts. Different tabs get different
// session ids so two new pages can be drafted in parallel without
// stomping each other.
function readOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing !== null && existing !== '') {
      return existing
    }
    // sessionStorage scopes to the tab, which matches the "one new
    // page per tab" mental model. Crypto-grade randomness isn't
    // required; collisions only matter within a tab.
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    window.sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return Date.now().toString(36)
  }
}

export function useCreatePageDraft({ body, meta }: UseCreatePageDraftOptions): UseCreatePageDraftResult {
  const sessionIdRef = useRef<string>('')
  if (sessionIdRef.current === '') {
    sessionIdRef.current = readOrCreateSessionId()
  }
  const sessionId = sessionIdRef.current
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`

  const [loadedDraft, setLoadedDraft] = useState<StoredCreateDraft | null>(null)
  const didReadRef = useRef(false)

  // Read once on mount.
  useEffect(() => {
    if (didReadRef.current) {
      return
    }
    didReadRef.current = true
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) {
        setLoadedDraft(null)
        return
      }
      const parsed = JSON.parse(raw) as Partial<StoredCreateDraft>
      if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.body) || parsed.meta === undefined) {
        window.localStorage.removeItem(key)
        setLoadedDraft(null)
        return
      }
      setLoadedDraft(parsed as StoredCreateDraft)
    } catch {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // Ignore secondary failures.
      }
      setLoadedDraft(null)
    }
  }, [key])

  // Mirror current body + meta into LS on every change. Pure
  // synchronous writes — `localStorage` doesn't yield, but the
  // autosave hook upstream already debounces editor updates so this
  // doesn't fire on every keystroke.
  useEffect(() => {
    const payload: StoredCreateDraft = {
      version: STORAGE_VERSION,
      sessionId,
      body,
      meta,
      savedAt: Date.now(),
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(payload))
    } catch {
      // Quota or disabled storage — silently ignore.
    }
  }, [key, sessionId, body, meta])

  // Listen for peer-tab `storage` events so a "cleared" event in
  // another tab updates this tab's `loadedDraft` to null. Body
  // contents are intentionally not merged — the create flow assumes
  // one tab owns the draft.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== key) {
        return
      }
      if (event.newValue === null) {
        setLoadedDraft(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore.
    }
    setLoadedDraft(null)
  }, [key])

  // Migrate the LS slot from `cms-page-draft:new:<sessionId>` to
  // `cms-page-draft:<pageId>:<token>` so the edit-mode hook treats
  // the just-saved page exactly the same as any other page that's
  // been opened with an existing LS slot. Best-effort: failures
  // (quota, disabled storage) are non-fatal because the body has
  // already been pushed to the server in the same transaction.
  const migrateToEditKey = useCallback(
    (pageId: string, clientRevisionToken: string, latestBody: PortableTextBody) => {
      const editKey = `cms-page-draft:${pageId}:${clientRevisionToken}`
      const editPayload = {
        version: STORAGE_VERSION,
        pageId,
        clientRevisionToken,
        body: latestBody,
        savedAt: Date.now(),
      }
      try {
        window.localStorage.setItem(editKey, JSON.stringify(editPayload))
        window.localStorage.removeItem(key)
        // Also burn the per-tab session id so a fresh "/editor/page/new"
        // starts a clean slot rather than reviving the just-migrated
        // draft.
        window.sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // Ignore.
      }
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
