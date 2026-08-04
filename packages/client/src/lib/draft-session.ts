import type { ZodType } from 'zod'

import {
  getDraft,
  removeDraft,
  removeDraftsByPrefix,
  setDraft,
  type DraftRecord,
  type DraftType,
} from '@kobato/client/lib/draft-store'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One owner for the draft-record lifecycle: load → version/schema-check →
 * purge-or-hydrate, a loadComplete-gated persist, and the cross-tab clear
 * broadcast. `useLocalDraft` and `useCreateDraft` are thin adapters over this
 * session — they only supply a key source and a loaded-draft mapping.
 */

/** Bump when the persisted draft shape changes; stale records are purged on load. */
export const DRAFT_STORAGE_VERSION = 1

/** Edit-mode draft key — shared by the edit adapter and the create adapter's migration. */
export function draftEditKey(keyPrefix: string, entityId: string, clientRevisionToken: string): string {
  return `${keyPrefix}${entityId}:${clientRevisionToken}`
}

interface BroadcastMessage {
  kind: 'cleared'
  key: string
}

export interface UseDraftSessionArgs<TBody, TLoaded> {
  /** Storage key for this session, or null while the draft surface is inactive. */
  key: string | null
  /**
   * When the key embeds a rotating token (`<prefix><entityId>:<token>`),
   * the adapter supplies the stable entity prefix here so `clearDraft`
   * sweeps orphaned rotated predecessors, not just the current-token key
   * (audit P1-15). Omit for token-free keys — the clear stays per-key.
   */
  clearPrefix?: string
  broadcastName: string
  draftType: DraftType
  bodySchema: ZodType<TBody>
  body: TBody
  /** Persisted alongside the body on every write when defined. */
  meta?: unknown
  /**
   * Map a version- and schema-valid record to the adapter's loaded-draft
   * shape. Return null to reject the record — it is purged like a
   * version/schema mismatch.
   */
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

  // Synchronously clear state when key becomes null (e.g. dialog closed).
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    if (key === null) {
      setLoadedDraft(null)
    }
  }

  // Load → version-check → schema-check → purge-or-hydrate, once per key.
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

  // Persist on every body/meta change, but never before the initial load
  // completed — a stale write must not clobber the stored draft.
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
      } catch {
        // Quota or disabled storage — silently ignore.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, body, meta, draftType])

  // A clear in any tab clears the hydrated draft in every other tab.
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
    } catch {
      // BroadcastChannel unavailable (older Safari).
    }
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
    } catch {
      // Ignore.
    }
  }, [key, clearPrefix, broadcastName])

  return { loadedDraft, clearDraft }
}
