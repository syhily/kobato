import { useCallback, useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { SaveBodyOutput } from '@/shared/types/revision'
import type {
  EditorShellStatus,
  EntityLike,
  PublishState,
  RevisionLike,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { useLocalDraft } from '@/client/hooks/use-local-draft'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-derived'
import { useActionBanner } from '@/ui/admin/editor-shell/use-action-banner'
import { useEditorKeyboardShortcuts } from '@/ui/admin/editor-shell/use-editor-keyboard-shortcuts'
import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

// The module owns the empty-body identity: both "no body yet" paths must
// hand out this single reference, never a fresh `[]`. A fresh array per
// recompute fed the conflict check below into an infinite
// setState-during-render loop ("Too many re-renders") — live in edit mode
// when an entity has zero revisions.
const EMPTY_BODY: PortableTextBody = []

export function useEditorShellState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>): UseEditorShellStateOutput<TMeta> {
  const {
    mode,
    entityKind: _entityKind,
    detail,
    emptyMeta,
    metaDraftFromEntity,
    metaDraftsEqual,
    localDraftConfig,
    createDraftConfig,
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

  // --- Body state ------------------------------------------------------------
  // `detail` is the loader-stable reference the screen memoizes, so the memos
  // below recompute only when the loaded entity actually changes.
  const initialBody = useMemo<PortableTextBody>(() => {
    return deriveBaselineRevision(detail)?.body ?? EMPTY_BODY
  }, [detail])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (detail === undefined) {
      return 'create:initial'
    }
    const rev = deriveBaselineRevision(detail)
    return rev !== null ? `${detail.entity.id}:${rev.clientRevisionToken}` : `${detail.entity.id}:empty`
  }, [detail])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)
  const [lastSavedBody, setLastSavedBody] = useState<PortableTextBody>(initialBody)

  const replaceBody = useCallback((newBody: PortableTextBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }, [])

  const markBodySaved = useCallback((savedBody: PortableTextBody) => {
    setLastSavedBody(savedBody)
  }, [])

  // --- Meta state ------------------------------------------------------------
  const [meta, setMeta] = useState<TMeta>(detail !== undefined ? metaDraftFromEntity(detail.entity) : emptyMeta)
  const [lastPersistedMeta, setLastPersistedMeta] = useState<TMeta>(
    detail !== undefined ? metaDraftFromEntity(detail.entity) : { ...emptyMeta },
  )
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(
    detail !== undefined ? detail.entity.publishedAt : null,
  )

  const resetMeta = useCallback((freshMeta: TMeta, publishedAt: string | null) => {
    setMeta(freshMeta)
    setLastPersistedMeta(freshMeta)
    setServerPublishedAtIso(publishedAt)
  }, [])

  // --- Revision race state -----------------------------------------------------
  const [expectedToken, setExpectedToken] = useState<string | null>(
    deriveBaselineRevision(detail)?.clientRevisionToken ?? null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.latestRevision : null,
  )
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.publishedRevision : null,
  )

  const updateAfterSave = useCallback((revision: RevisionLike) => {
    setExpectedToken(revision.clientRevisionToken)
    setLatestRevision(revision)
    if (revision.status === 'published') {
      setPublishedRevision(revision)
    }
  }, [])

  // --- Layout ------------------------------------------------------------------
  const { previewOpen, setPreviewOpen, metaOpen, setMetaOpen, isLg, editorScrollRef, previewScrollRef } =
    useEditorShellLayout()

  const [status, setStatus] = useState<EditorShellStatus>({ kind: 'idle' })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() =>
    isEditing ? deriveBaselineUpdatedAtMs(detail) : null,
  )

  // --- LS draft hooks -------------------------------------------------------
  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
  })
  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

  // --- Banner (post-save preview link) -------------------------------------
  // The banner protocol (arm → note legs → show / cancel) lives in
  // useActionBanner: persist arms the countdown, the save reducers below
  // note legs and cancel. No shared mutable ref crosses the module boundary.
  const {
    banner: previewBanner,
    begin: beginActionBanner,
    noteLeg: noteActionLegSucceeded,
    cancel: cancelActionBanner,
    dismiss: dismissPreviewBanner,
  } = useActionBanner()

  // --- Create-mode LS hydration --------------------------------------------
  // Render-phase state adjustment (the react-compiler-safe pattern, same as
  // the conflict check below): hydrate once, the first time the create draft
  // resolves. `null` means the load settled with nothing stored — mark
  // hydrated and keep the empty draft.
  const [createDraftHydrated, setCreateDraftHydrated] = useState(false)
  if (!isEditing && !createDraftHydrated) {
    setCreateDraftHydrated(true)
    if (createDraft.loadedDraft !== null) {
      setMeta(createDraft.loadedDraft.meta)
      replaceBody(createDraft.loadedDraft.body, `create:restored:${createDraft.loadedDraft.savedAt}`)
    }
  }

  // --- Conflict detection (edit mode) --------------------------------------
  const [conflict, setConflict] = useState<{
    localBody: PortableTextBody
    localSavedAt: number
  } | null>(null)
  const [conflictResolved, setConflictResolved] = useState(false)
  const [lastConflictCheck, setLastConflictCheck] = useState({
    loadedLocalDraft,
    initialBody,
    conflictResolved,
  })
  if (
    lastConflictCheck.loadedLocalDraft !== loadedLocalDraft ||
    lastConflictCheck.initialBody !== initialBody ||
    lastConflictCheck.conflictResolved !== conflictResolved
  ) {
    setLastConflictCheck({ loadedLocalDraft, initialBody, conflictResolved })
    if (
      !conflictResolved &&
      loadedLocalDraft !== null &&
      !arePortableTextBodiesEquivalent(loadedLocalDraft.body, initialBody)
    ) {
      setConflict({ localBody: loadedLocalDraft.body, localSavedAt: loadedLocalDraft.savedAt })
    }
  }

  // --- Save reducers -------------------------------------------------------
  const onMetaSaved = useCallback(
    (saved: TEntity) => {
      // A save round runs the meta and body legs concurrently; when the body
      // leg already landed with a warning, the meta leg must not hide it.
      setStatus((prev) => (prev.kind === 'warning' ? prev : { kind: 'saved', at: new Date() }))
      const freshMeta = metaDraftFromEntity(saved)
      resetMeta(freshMeta, saved.publishedAt)
      const saveMs = Date.parse(saved.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      noteActionLegSucceeded(saved.slug)
    },
    [metaDraftFromEntity, noteActionLegSucceeded, resetMeta],
  )

  const onBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      if (payload.status === 'conflict') {
        setStatus({ kind: 'conflict', expectedToken: payload.expectedToken })
        cancelActionBanner()
        return
      }
      if (payload.warning !== undefined) {
        setStatus({ kind: 'warning', message: payload.warning })
      } else {
        setStatus({ kind: 'saved', at: new Date() })
      }
      const saveMs = Date.parse(payload.revision.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      const slugForBanner = meta.slug.trim() === '' ? (detail?.entity.slug ?? '') : meta.slug.trim()
      noteActionLegSucceeded(slugForBanner)
      updateAfterSave(payload.revision)
      markBodySaved(payload.revision.body)
    },
    [meta.slug, detail, cancelActionBanner, noteActionLegSucceeded, updateAfterSave, markBodySaved],
  )

  const onUnpublishSaved = useCallback(
    (saved: TEntity, freshMeta: TMeta) => {
      setStatus({ kind: 'saved', at: new Date() })
      resetMeta(freshMeta, saved.publishedAt)
      const saveMs = Date.parse(saved.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      dismissPreviewBanner()
    },
    [resetMeta, dismissPreviewBanner],
  )

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
    detail,
    draft: {
      meta,
      body,
      expectedToken,
      lastSavedBody,
      serverPublishedAtIso,
      conflict,
    },
    mutations: {
      upsertMetaFn,
      saveDraftFn,
      publishFn,
      unpublishFn,
      buildUpsertMetaPayload,
      directSaveDraft,
    },
    reducers: {
      metaDraftFromEntity,
      onMetaSaved,
      onBodySaved,
      onUnpublishSaved,
      noteError,
      setStatus,
      setMeta,
      setServerPublishedAtIso,
      markBodySaved,
    },
    routing: { editPath, navigate },
    actionBanner: { begin: beginActionBanner },
    createDraft,
  })

  // --- Derived flags + projections -----------------------------------------
  // Baseline timestamp (latest revision, else published, else the entity
  // row's own updatedAt) — single-owner projection from editor-shell-derived,
  // consumed by the conflict dialog in the screen.
  const baselineUpdatedAtMs = useMemo(() => (isEditing ? deriveBaselineUpdatedAtMs(detail) : null), [isEditing, detail])

  const publishState = useMemo<PublishState>(
    () =>
      isEditing ? derivePublishState(latestRevision, publishedRevision, meta.published) : { kind: 'not-published-yet' },
    [isEditing, latestRevision, publishedRevision, meta.published],
  )

  const sidebarPublishStatus = useMemo<SidebarPublishStatus | null>(
    () => deriveSidebarPublishStatus({ isEditing, publishState, publishedAt: meta.publishedAt }),
    [isEditing, publishState, meta.publishedAt],
  )

  // --- Keyboard shortcuts --------------------------------------------------
  useEditorKeyboardShortcuts({
    mode,
    isEditing,
    persistCreate,
    persistSave,
    persistPublish,
    publishState,
  })

  // --- Conflict / history adoption handlers -------------------------------
  const adoptLocalDraft = useCallback(async () => {
    if (conflict === null || !isEditing || !detail) {
      return
    }
    replaceBody(conflict.localBody, `${detail.entity.id}:adopt-local:${Date.now()}`)
    setConflict(null)
    setConflictResolved(true)
    setStatus({ kind: 'saving' })
    try {
      const result = await directSaveDraft({
        id: detail.entity.id,
        body: conflict.localBody,
        expectedClientRevisionToken: expectedToken,
        force: true,
      })
      onBodySaved(result)
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }, [conflict, isEditing, detail, expectedToken, directSaveDraft, onBodySaved, replaceBody])

  const adoptServerVersion = useCallback(() => {
    replaceBody(initialBody, `${detail?.entity.id ?? 'new'}:adopt-server:${Date.now()}`)
    markBodySaved(initialBody)
    clearLocalDraft()
    setConflict(null)
    setConflictResolved(true)
  }, [initialBody, detail, clearLocalDraft, replaceBody, markBodySaved])

  const adoptRevisionFromHistory = useCallback(
    (revision: { body: PortableTextBody; revisionNo: number }) => {
      if (!isEditing || !detail) {
        return
      }
      replaceBody(revision.body, `${detail.entity.id}:adopt-revision:${revision.revisionNo}:${Date.now()}`)
      setStatus({ kind: 'info', message: `已载入 R${revision.revisionNo}，记得保存或发布以生效。` })
    },
    [isEditing, detail, replaceBody],
  )

  // --- Sidebar projection --------------------------------------------------
  const canPersistMeta = meta.title.trim() !== ''
  const canPublish = isEditing && publishState.kind !== 'published-current'
  const sidebarRevisionSummary = deriveSidebarRevisionSummary({ isEditing, publishState })
  const isBodyDirty = !arePortableTextBodiesEquivalent(body, lastSavedBody)
  const isMetaDirty = !metaDraftsEqual(meta, lastPersistedMeta)
  const sidebarSaveStatus = deriveSidebarSaveStatus({ status, isEditing, isBodyDirty, isMetaDirty, displaySaveAtMs })

  return {
    meta,
    setMeta,
    body,
    setBody,
    bodyKey,
    initialBody,
    isEditing,

    previewOpen,
    setPreviewOpen,
    metaOpen,
    setMetaOpen,
    isLg,

    editorScrollRef,
    previewScrollRef,

    previewBanner,
    dismissPreviewBanner,
    createDraftSavedAt: createDraft.loadedDraft?.savedAt ?? null,

    toolbar: {
      previewOpen,
      setPreviewOpen,
      metaOpen,
      setMetaOpen,
      published: meta.published,
      isPending,
      isSavingDraft,
      isPublishing,
      isUnpublishing,
      isCreating,
      canPersistMeta,
      canPublish,
      publishStatus: sidebarPublishStatus,
      persistCreate,
      persistSave,
      persistPublish,
      persistUnpublish,
    },

    sidebar: {
      draft: meta,
      onChange: setMeta,
      disabled: isPending,
      publishStatus: sidebarPublishStatus,
      revisionSummary: sidebarRevisionSummary,
      saveStatus: sidebarSaveStatus,
      expectedToken,
      body,
      adoptRevisionFromHistory,
    },

    dialog: {
      conflict,
      serverBody: initialBody,
      baselineUpdatedAtMs,
      adoptLocalDraft,
      adoptServerVersion,
    },
  }
}
