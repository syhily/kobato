import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  EditorBody,
  EditorShellStatus,
  EntityLike,
  PublishState,
  SaveBodyOutput,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { useLocalDraft } from '@/client/hooks/use-local-draft'
import { areInklingDocumentsEquivalent } from '@/shared/inkling/normalize'
import {
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-derived'
import { useEditorBodyState } from '@/ui/admin/editor-shell/use-editor-body-state'
import { useEditorKeyboardShortcuts } from '@/ui/admin/editor-shell/use-editor-keyboard-shortcuts'
import { useEditorMetaState } from '@/ui/admin/editor-shell/use-editor-meta-state'
import { useEditorRevisionManager } from '@/ui/admin/editor-shell/use-editor-revision-manager'
import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

export function useEditorShellState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>): UseEditorShellStateOutput<TMeta, TEntity> {
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
  const shellArgs =
    isEditing && detail ? { isEditing: true as const, detail } : { isEditing: false as const, detail: undefined }

  const bodyState = useEditorBodyState(shellArgs)
  const { body, setBody, bodyKey, initialBody, lastSavedBody, replaceBody, markBodySaved } = bodyState

  const metaState = useEditorMetaState(shellArgs, emptyMeta, metaDraftFromEntity)
  const { meta, setMeta, lastPersistedMeta, serverPublishedAtIso, resetMeta } = metaState

  const revisionManager = useEditorRevisionManager(shellArgs)
  const { expectedToken, latestRevision, publishedRevision, updateAfterSave } = revisionManager

  const { metaOpen, setMetaOpen, isLg, editorScrollRef } = useEditorShellLayout()

  const [status, setStatus] = useState<EditorShellStatus>({ kind: 'idle' })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() => {
    if (!isEditing || detail === undefined) {
      return null
    }
    const iso = (detail.latestRevision ?? detail.publishedRevision)?.updatedAt ?? detail.entity.updatedAt
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? null : ms
  })

  // --- LS draft hooks -------------------------------------------------------
  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
  })
  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

  // --- Banner (post-save preview link) -------------------------------------
  const pendingActionRef = useRef<{ kind: 'draft' | 'published'; remaining: number } | null>(null)
  const [previewBanner, setPreviewBanner] = useState<{
    kind: 'draft' | 'published'
    slug: string
  } | null>(null)
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
    replaceBody(createDraft.loadedDraft.body, `create:restored:${createDraft.loadedDraft.savedAt}`)
  }, [isEditing, createDraft.loadedDraft, setMeta, replaceBody, setBody])

  // --- Conflict detection (edit mode) --------------------------------------
  const [conflict, setConflict] = useState<{
    localBody: EditorBody
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
      !areInklingDocumentsEquivalent(loadedLocalDraft.body, initialBody)
    ) {
      setConflict({ localBody: loadedLocalDraft.body, localSavedAt: loadedLocalDraft.savedAt })
    }
  }

  // --- Save reducers -------------------------------------------------------
  const onMetaSaved = useCallback(
    (saved: TEntity) => {
      setStatus({ kind: 'saved', at: new Date() })
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
      setStatus({ kind: 'saved', at: new Date() })
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
      setPreviewBanner(null)
    },
    [resetMeta],
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
    setServerPublishedAtIso: metaState.setServerPublishedAtIso,
    lastSavedBody,
    markBodySaved,
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
    return !areInklingDocumentsEquivalent(body, lastSavedBody)
  }, [isEditing, body, publishState, lastSavedBody])

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
    (revision: { body: EditorBody; revisionNo: number }) => {
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
  const isBodyDirty = !areInklingDocumentsEquivalent(body, lastSavedBody)
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

    status,
    sidebarSaveStatus,

    metaOpen,
    setMetaOpen,
    isLg,

    editorScrollRef,

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
