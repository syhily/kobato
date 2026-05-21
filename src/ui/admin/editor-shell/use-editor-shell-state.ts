import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  EditorShellStatus,
  EntityLike,
  PublishState,
  RevisionLike,
  SaveBodyOutput,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import {
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-derived'
import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

// --- Hook -------------------------------------------------------------------

/**
 * Shared state machine for the post + page editor shells. Owns:
 *
 *  - body + meta drafts (with persistence baselines)
 *  - layout toggles (preview, meta panel, lg breakpoint)
 *  - revision token + last-loaded snapshots
 *  - draft conflict detection vs local-storage payload
 *  - autosave loop dispatch
 *  - persistSave / persistPublish / persistCreate / persistUnpublish
 *  - keyboard shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+Shift+P)
 *  - publish-state projection + sidebar status projections
 *
 * Per-entity differences (DTO key shape, API endpoint paths, mutation
 * payload fields, sidebar component) stay in the Shell — see
 * `PostEditorShell.tsx` / `PageEditorShell.tsx` for the wiring.
 */
export function useEditorShellState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
>(args: UseEditorShellStateArgs<TMeta, TEntity>): UseEditorShellStateOutput<TMeta> {
  const {
    mode,
    entityKind: _entityKind,
    detail,
    emptyMeta,
    metaDraftFromEntity,
    metaDraftsEqual,
    useLocalDraftHook,
    useCreateDraftHook,
    upsertMetaFn,
    saveDraftFn,
    publishFn,
    unpublishFn,
    buildUpsertMetaPayload,
    directSaveDraft,
    editPath,
    navigate,
  } = args

  const isEditing = mode === 'edit' && detail !== undefined

  // --- Meta draft -----------------------------------------------------------
  const [meta, setMeta] = useState<TMeta>(isEditing ? metaDraftFromEntity(detail.entity) : emptyMeta)

  // --- Body draft -----------------------------------------------------------
  const initialBody = useMemo<PortableTextBody>(() => {
    if (!isEditing) {
      return []
    }
    return (detail.latestRevision ?? detail.publishedRevision)?.body ?? []
  }, [isEditing, detail])
  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (!isEditing) {
      return 'create:initial'
    }
    const rev = detail.latestRevision ?? detail.publishedRevision
    return rev !== null ? `${detail.entity.id}:${rev.clientRevisionToken}` : `${detail.entity.id}:empty`
  }, [isEditing, detail])
  const [bodyKey, setBodyKey] = useState(initialBodyKey)

  // --- Live preview pane ----------------------------------------------------
  const { previewOpen, setPreviewOpen, metaOpen, setMetaOpen, isLg, editorScrollRef, previewScrollRef } =
    useEditorShellLayout()

  // --- Revision tokens + mirrors -------------------------------------------
  const [expectedToken, setExpectedToken] = useState<string | null>(
    isEditing ? ((detail.latestRevision ?? detail.publishedRevision)?.clientRevisionToken ?? null) : null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(isEditing ? detail.latestRevision : null)
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    isEditing ? detail.publishedRevision : null,
  )
  // Mirror of `entity.publishedAt` that follows meta save round-trips.
  // We need it to detect "operator just switched out of 定时发布
  // mode" — `meta.publishedAt === ''` is ambiguous on its own.
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(
    isEditing ? detail.entity.publishedAt : null,
  )

  // --- Status chip ---------------------------------------------------------
  const [status, setStatus] = useState<EditorShellStatus>({
    kind: 'idle',
  })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() => {
    if (!isEditing || detail === undefined) {
      return null
    }
    const iso = (detail.latestRevision ?? detail.publishedRevision)?.updatedAt ?? detail.entity.updatedAt
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? null : ms
  })

  // --- Baselines (for dirty + skip-no-op-save) -----------------------------
  const lastPersistedMetaRef = useRef<TMeta>(
    isEditing && detail !== undefined ? metaDraftFromEntity(detail.entity) : { ...emptyMeta },
  )
  const lastSavedBodyRef = useRef<PortableTextBody>(initialBody)

  // --- LS draft hooks (called with the live body/meta we own) -------------
  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraftHook({
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
  })
  const createDraft = useCreateDraftHook({ body, meta })

  // --- Banner (post-save preview link) -------------------------------------
  const pendingActionRef = useRef<{ kind: 'draft' | 'published'; remaining: number } | null>(null)
  const [previewBanner, setPreviewBanner] = useState<{ kind: 'draft' | 'published'; slug: string } | null>(null)
  const dismissPreviewBanner = useCallback(() => setPreviewBanner(null), [])
  const noteActionLegSucceeded = useCallback((slugForBanner: string) => {
    const pending = pendingActionRef.current
    if (pending === null) {
      return
    }
    pending.remaining -= 1
    if (pending.remaining > 0) {
      return
    }
    const kind = pending.kind
    pendingActionRef.current = null
    setPreviewBanner({ kind, slug: slugForBanner })
  }, [])
  const cancelActionBanner = useCallback(() => {
    pendingActionRef.current = null
  }, [])

  // --- Create-mode LS hydration --------------------------------------------
  const createDraftHydratedRef = useRef(false)
  useEffect(() => {
    if (isEditing) {
      return
    }
    if (createDraftHydratedRef.current) {
      return
    }
    if (createDraft.loadedDraft === null) {
      createDraftHydratedRef.current = true
      return
    }
    createDraftHydratedRef.current = true
    setMeta(createDraft.loadedDraft.meta)
    setBody(createDraft.loadedDraft.body)
    setBodyKey(`create:restored:${createDraft.loadedDraft.savedAt}`)
  }, [isEditing, createDraft.loadedDraft])

  // --- Conflict detection (edit mode) --------------------------------------
  const [conflict, setConflict] = useState<{ localBody: PortableTextBody; localSavedAt: number } | null>(null)
  const [conflictResolved, setConflictResolved] = useState(false)
  useEffect(() => {
    if (conflictResolved) {
      return
    }
    if (loadedLocalDraft === null) {
      return
    }
    if (arePortableTextBodiesEquivalent(loadedLocalDraft.body, initialBody)) {
      return
    }
    setConflict({ localBody: loadedLocalDraft.body, localSavedAt: loadedLocalDraft.savedAt })
  }, [loadedLocalDraft, initialBody, conflictResolved])

  // --- Save reducers (Shell wires these via mutation onSuccess) ------------
  const onMetaSaved = useCallback(
    (saved: EntityLike) => {
      setStatus({ kind: 'saved', at: new Date() })
      const freshMeta = metaDraftFromEntity(saved as TEntity)
      lastPersistedMetaRef.current = freshMeta
      const saveMs = Date.parse(saved.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      setMeta(freshMeta)
      setServerPublishedAtIso(saved.publishedAt)
      noteActionLegSucceeded(saved.slug)
    },
    [metaDraftFromEntity, noteActionLegSucceeded],
  )

  const onBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      if (payload.status === 'conflict') {
        setStatus({ kind: 'conflict', expectedToken: payload.expectedToken })
        cancelActionBanner()
        return
      }
      setStatus({ kind: 'saved', at: new Date() })
      const saveMs = Date.parse(payload.revision.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      const slugForBanner = meta.slug.trim() === '' ? (detail?.entity.slug ?? '') : meta.slug.trim()
      noteActionLegSucceeded(slugForBanner)
      setExpectedToken(payload.revision.clientRevisionToken)
      setLatestRevision(payload.revision)
      if (payload.revision.status === 'published') {
        setPublishedRevision(payload.revision)
      }
      lastSavedBodyRef.current = payload.revision.body
    },
    [meta.slug, detail, cancelActionBanner, noteActionLegSucceeded],
  )

  const onUnpublishSaved = useCallback((saved: EntityLike, freshMeta: TMeta) => {
    setStatus({ kind: 'saved', at: new Date() })
    lastPersistedMetaRef.current = freshMeta
    const saveMs = Date.parse(saved.updatedAt)
    if (!Number.isNaN(saveMs)) {
      setDisplaySaveAtMs(saveMs)
    }
    setMeta(freshMeta)
    setServerPublishedAtIso(saved.publishedAt)
    // Take the entity offline = drop any leftover banner; the public
    // URL is no longer accessible.
    setPreviewBanner(null)
  }, [])

  const noteError = useCallback(
    (message: string) => {
      setStatus({ kind: 'error', message })
      cancelActionBanner()
    },
    [cancelActionBanner],
  )

  // --- Persist (mutations + autosave + handlers) ---------------------------
  const {
    isPending,
    isSavingDraft,
    isPublishing,
    isUnpublishing,
    isCreating,
    persistCreate,
    persistSave,
    persistPublish,
    persistUnpublish,
  } = useEditorShellPersist({
    isEditing,
    meta,
    body,
    expectedToken,
    detail,
    serverPublishedAtIso,
    conflict,
    upsertMetaFn,
    saveDraftFn,
    publishFn,
    unpublishFn,
    buildUpsertMetaPayload,
    directSaveDraft,
    editPath,
    navigate,
    metaDraftFromEntity,
    onMetaSaved,
    onBodySaved,
    onUnpublishSaved,
    noteError,
    setStatus,
    setMeta,
    setServerPublishedAtIso,
    lastSavedBodyRef,
    pendingActionRef,
    createDraft,
  })

  // --- Derived flags + projections -----------------------------------------
  const publishState = useMemo<PublishState>(
    () =>
      isEditing ? derivePublishState(latestRevision, publishedRevision, meta.published) : { kind: 'not-published-yet' },
    [isEditing, latestRevision, publishedRevision, meta.published],
  )

  const showPreviewPublicSyncHint = useMemo(() => {
    if (!isEditing) {
      return false
    }
    if (publishState.kind === 'draft-ahead') {
      return true
    }
    return !arePortableTextBodiesEquivalent(body, lastSavedBodyRef.current)
  }, [isEditing, body, publishState])

  const sidebarPublishStatus = useMemo<SidebarPublishStatus | null>(
    () => deriveSidebarPublishStatus({ isEditing, publishState, publishedAt: meta.publishedAt }),
    [isEditing, publishState, meta.publishedAt],
  )

  // --- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 's' && !event.shiftKey) {
        event.preventDefault()
        if (mode === 'create') {
          void persistCreate()
        } else {
          persistSave()
        }
        return
      }
      if (key === 'p' && event.shiftKey) {
        event.preventDefault()
        if (!isEditing) {
          return
        }
        if (publishState.kind !== 'published-current') {
          persistPublish()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, isEditing, persistCreate, persistSave, persistPublish, publishState])

  // --- Conflict / history adoption handlers -------------------------------
  const adoptLocalDraft = useCallback(async () => {
    if (conflict === null || !isEditing) {
      return
    }
    setBody(conflict.localBody)
    setBodyKey(`${detail!.entity.id}:adopt-local:${Date.now()}`)
    setConflict(null)
    setConflictResolved(true)
    setStatus({ kind: 'saving' })
    try {
      const result = await directSaveDraft({
        id: detail!.entity.id,
        body: conflict.localBody,
        expectedClientRevisionToken: expectedToken,
        force: true,
      })
      // `handleBodySavedRef` lives inside `useEditorShellPersist`,
      // but `onBodySaved` is the same callback object. We can call
      // it directly because the ref indirection was only needed for
      // the autosave flush closure.
      onBodySaved(result)
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }, [conflict, isEditing, detail, expectedToken, directSaveDraft, onBodySaved])

  const adoptServerVersion = useCallback(() => {
    setBody(initialBody)
    setBodyKey(`${detail?.entity.id ?? 'new'}:adopt-server:${Date.now()}`)
    lastSavedBodyRef.current = initialBody
    clearLocalDraft()
    setConflict(null)
    setConflictResolved(true)
  }, [initialBody, detail, clearLocalDraft])

  const adoptRevisionFromHistory = useCallback(
    (revision: { body: PortableTextBody; revisionNo: number }) => {
      if (!isEditing) {
        return
      }
      setBody(revision.body)
      setBodyKey(`${detail!.entity.id}:adopt-revision:${revision.revisionNo}:${Date.now()}`)
      setStatus({ kind: 'info', message: `已载入 R${revision.revisionNo}，记得保存或发布以生效。` })
    },
    [isEditing, detail],
  )

  // --- Sidebar projection (revision summary + save status) ----------------
  const canPersistMeta = meta.title.trim() !== ''
  const canPublish = isEditing && publishState.kind !== 'published-current'

  const sidebarRevisionSummary = deriveSidebarRevisionSummary({ isEditing, publishState })

  const isBodyDirty = !arePortableTextBodiesEquivalent(body, lastSavedBodyRef.current)
  const isMetaDirty = !metaDraftsEqual(meta, lastPersistedMetaRef.current)
  const sidebarSaveStatus = deriveSidebarSaveStatus({
    status,
    isEditing,
    isBodyDirty,
    isMetaDirty,
    displaySaveAtMs,
  })

  return {
    meta,
    setMeta,
    body,
    setBody,
    bodyKey,
    initialBody,
    isEditing,

    status,
    sidebarSaveStatus,

    previewOpen,
    setPreviewOpen,
    metaOpen,
    setMetaOpen,
    isLg,

    editorScrollRef,
    previewScrollRef,

    conflict,

    previewBanner,
    dismissPreviewBanner,
    createDraftSavedAt: createDraft.loadedDraft?.savedAt ?? null,

    isPending,
    isSavingDraft,
    isPublishing,
    isUnpublishing,
    isCreating,

    canPersistMeta,
    canPublish,
    publishState,
    sidebarPublishStatus,
    sidebarRevisionSummary,
    showPreviewPublicSyncHint,
    expectedToken,

    persistCreate,
    persistSave,
    persistPublish,
    persistUnpublish,

    adoptLocalDraft,
    adoptServerVersion,
    adoptRevisionFromHistory,

    onMetaSaved,
    onBodySaved,
    onUnpublishSaved,
    noteError,
  }
}
