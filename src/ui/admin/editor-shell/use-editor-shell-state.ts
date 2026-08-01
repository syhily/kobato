import { useCallback, useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  ConflictFreezeSource,
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
import { useEditorKeyboardShortcuts } from '@/ui/admin/editor-shell/use-editor-keyboard-shortcuts'
import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

// Both "no body yet" paths must hand out this single reference, never a
// fresh `[]` — a fresh array triggers infinite setState-during-render.
const EMPTY_BODY: PortableTextBody = []

export function useEditorShellState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>): UseEditorShellStateOutput<TMeta> {
  const {
    mode,
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

  const replaceBody = useCallback((newBody: PortableTextBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }, [])

  // --- Meta state ------------------------------------------------------------
  const [meta, setMeta] = useState<TMeta>(detail !== undefined ? metaDraftFromEntity(detail.entity) : emptyMeta)
  const [lastPersistedMeta, setLastPersistedMeta] = useState<TMeta>(
    detail !== undefined ? metaDraftFromEntity(detail.entity) : { ...emptyMeta },
  )

  const resetMeta = useCallback((freshMeta: TMeta) => {
    setMeta(freshMeta)
    setLastPersistedMeta(freshMeta)
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
  // The `server` leg of the autosave freeze: set via persist's
  // `noteRevisionConflict` (the server rejected the revision token),
  // cleared by the next clean body save below. Lives beside the token it
  // guards — persist only reads the merged freeze via `draft.freeze`.
  const [serverConflicted, setServerConflicted] = useState(false)

  const updateAfterSave = useCallback((revision: RevisionLike) => {
    // A clean body save is also the server-conflict recovery: it clears
    // the `server` leg of the autosave freeze (the `local` leg only
    // clears through the dialog's adopt handlers).
    setServerConflicted(false)
    setExpectedToken(revision.clientRevisionToken)
    setLatestRevision(revision)
    if (revision.status === 'published') {
      setPublishedRevision(revision)
    }
  }, [])

  // --- Layout ------------------------------------------------------------------
  const { previewOpen, setPreviewOpen, metaOpen, setMetaOpen, isLg, editorScrollRef, previewScrollRef } =
    useEditorShellLayout()

  // --- LS draft hooks -------------------------------------------------------
  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
  })
  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

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

  // --- Persist notifications -------------------------------------------------
  // Persist owns the save-flow state and reports back through these
  // notifications only. The expected token stays here: it keys the
  // local-storage draft whose conflict gates persist's autosave — moving it
  // into persist would close a hook-ordering cycle. Both legs of the
  // autosave freeze live here for the same reason; persist reads the merged
  // single-sourced flag via `draft.freeze` and only REPORTS the server leg.
  const markMetaPublished = useCallback(() => {
    setMeta((m) => ({ ...m, published: true }))
  }, [])

  const noteRevisionConflict = useCallback(() => {
    setServerConflicted(true)
  }, [])

  // The merged autosave freeze: one gate, two sources. The local leg wins
  // the `source` label when both are set (its dialog carries the payload) —
  // the gate itself only reads "any leg set".
  const conflictFreeze: ConflictFreezeSource | null = conflict !== null ? 'local' : serverConflicted ? 'server' : null

  // --- Persist (mutations + autosave + handlers) ---------------------------
  const {
    status,
    setStatus,
    displaySaveAtMs,
    lastSavedBody,
    markBodySaved,
    previewBanner,
    dismissPreviewBanner,
    noteBodySaved,
    noteBodyPersisted,
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
    detail,
    draft: {
      meta,
      body,
      expectedToken,
      freeze: conflictFreeze,
    },
    mutations: {
      upsertMetaFn,
      saveDraftFn,
      publishFn,
      unpublishFn,
      buildUpsertMetaPayload,
      directSaveDraft,
    },
    metaDraftFromEntity,
    notifications: {
      applyServerMeta: resetMeta,
      markMetaPublished,
      noteRevisionSaved: updateAfterSave,
      noteRevisionConflict,
    },
    routing: { editPath, navigate },
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
      noteBodySaved(result)
      if (result.status === 'saved') {
        // Persisted outside both the engine and the manual-save flow:
        // advance the autosave baseline to the adopted body so the next
        // debounce tick short-circuits instead of re-PATCHing it.
        noteBodyPersisted(conflict.localBody)
      }
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }, [
    conflict,
    isEditing,
    detail,
    expectedToken,
    directSaveDraft,
    noteBodySaved,
    noteBodyPersisted,
    replaceBody,
    setStatus,
  ])

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
    [isEditing, detail, replaceBody, setStatus],
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
