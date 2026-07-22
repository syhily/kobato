import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { SaveBodyOutput } from '@/shared/types/revision'
import type {
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  RevisionLike,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useAutosave, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { localInputValueToIso } from '@/ui/admin/editor-shell/editor-datetime'
import { deriveBaselineRevision, deriveBaselineUpdatedAtMs } from '@/ui/admin/editor-shell/editor-shell-derived'
import { useActionBanner } from '@/ui/admin/editor-shell/use-action-banner'

/** Live draft snapshot the persist flows read (autosave + the four persist handlers). */
export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: PortableTextBody
  expectedToken: string | null
  conflict: { localBody: PortableTextBody; localSavedAt: number } | null
}

/** Entity-specific wire calls, straight from `UseEditorShellStateArgs`. */
export interface EditorShellPersistMutations<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput,
> {
  upsertMetaFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['upsertMetaFn']
  saveDraftFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['saveDraftFn']
  publishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['publishFn']
  unpublishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['unpublishFn']
  buildUpsertMetaPayload: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['buildUpsertMetaPayload']
  directSaveDraft: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['directSaveDraft']
}

/**
 * The few writes persist must report into orchestrator-owned state. The meta
 * draft and the revision-token race stay in the orchestrator: the token keys
 * the local-storage draft (`useLocalDraft`), and the conflict that draft
 * surfaces gates autosave here — moving the token into persist would close
 * a hook-ordering cycle between the two modules.
 */
export interface EditorShellPersistNotifications<TMeta> {
  /** Adopt the server-confirmed meta draft after a meta save / unpublish. */
  applyServerMeta: (meta: TMeta) => void
  /** Flip the local meta draft's `published` flag after a successful publish. */
  markMetaPublished: () => void
  /** Advance the revision race (expected token + latest/published) after a body save. */
  noteRevisionSaved: (revision: RevisionLike) => void
}

export interface UseEditorShellPersistArgs<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  /** Pre-loaded detail; `undefined` means create mode — every edit flow gates on it. */
  detail?: EditorShellDetail<TEntity>
  draft: EditorShellPersistDraft<TMeta>
  mutations: EditorShellPersistMutations<TMeta, TEntity, TUpsertMetaInput>
  /** Entity → meta-draft projection, straight from `UseEditorShellStateArgs`. */
  metaDraftFromEntity: (entity: TEntity) => TMeta
  notifications: EditorShellPersistNotifications<TMeta>
  routing: {
    editPath: (id: string) => string
    navigate: NavigateFunction
  }
  createDraft: { migrateToEditKey: (id: string, token: string, body: PortableTextBody) => void }
}

export function useEditorShellPersist<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellPersistArgs<TMeta, TEntity, TUpsertMetaInput>) {
  const { detail, draft, mutations, metaDraftFromEntity, notifications, routing, createDraft } = args
  const { meta, body, expectedToken, conflict } = draft
  const { upsertMetaFn, saveDraftFn, publishFn, unpublishFn, buildUpsertMetaPayload, directSaveDraft } = mutations
  const { applyServerMeta, markMetaPublished, noteRevisionSaved } = notifications
  const { editPath, navigate } = routing
  const isEditing = detail !== undefined

  // --- Owned save-flow state -------------------------------------------------
  // Status, the save timestamp, saved-body bookkeeping, the server's
  // publishedAt, and the post-save preview banner all live here: every
  // persist flow writes them and the orchestrator only projects them into
  // the sidebar / toolbar views. The banner protocol (arm → note legs →
  // show / cancel) never crosses the module boundary anymore — persist arms
  // the countdown and the mutation callbacks below note and cancel legs.
  const [status, setStatus] = useState<EditorShellStatus>({ kind: 'idle' })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() => deriveBaselineUpdatedAtMs(detail))
  const [lastSavedBody, setLastSavedBody] = useState<PortableTextBody>(() => deriveBaselineRevision(detail)?.body ?? [])
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(detail?.entity.publishedAt ?? null)
  const {
    banner: previewBanner,
    begin: beginActionBanner,
    noteLeg: noteActionLegSucceeded,
    cancel: cancelActionBanner,
    dismiss: dismissPreviewBanner,
  } = useActionBanner()

  const markBodySaved = useCallback((savedBody: PortableTextBody) => {
    setLastSavedBody(savedBody)
  }, [])

  // --- Mutation reducers (module-private) ------------------------------------
  const noteError = useCallback(
    (message: string) => {
      setStatus({ kind: 'error', message })
      cancelActionBanner()
    },
    [cancelActionBanner],
  )

  const noteMetaSaved = useCallback(
    (saved: TEntity) => {
      // A save round runs the meta and body legs concurrently; when the body
      // leg already landed with a warning, the meta leg must not hide it.
      setStatus((prev) => (prev.kind === 'warning' ? prev : { kind: 'saved', at: new Date() }))
      applyServerMeta(metaDraftFromEntity(saved))
      setServerPublishedAtIso(saved.publishedAt)
      const saveMs = Date.parse(saved.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      noteActionLegSucceeded(saved.slug)
    },
    [applyServerMeta, metaDraftFromEntity, noteActionLegSucceeded],
  )

  const noteBodySaved = useCallback(
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
      noteRevisionSaved(payload.revision)
      markBodySaved(payload.revision.body)
    },
    [meta.slug, detail, cancelActionBanner, noteActionLegSucceeded, noteRevisionSaved, markBodySaved],
  )

  const noteUnpublishSaved = useCallback(
    (saved: TEntity) => {
      setStatus({ kind: 'saved', at: new Date() })
      applyServerMeta(metaDraftFromEntity(saved))
      setServerPublishedAtIso(saved.publishedAt)
      const saveMs = Date.parse(saved.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      dismissPreviewBanner()
    },
    [applyServerMeta, metaDraftFromEntity, dismissPreviewBanner],
  )

  const upsertMetaMutation = useMutation({
    mutationFn: upsertMetaFn,
    onSuccess: (saved) => noteMetaSaved(saved),
    onError: (error) => noteError(error.message),
  })
  const saveDraftMutation = useMutation({
    mutationFn: saveDraftFn,
    onSuccess: (payload) => noteBodySaved(payload),
    onError: (error) => noteError(error.message),
  })
  const publishMutation = useMutation({
    mutationFn: publishFn,
    onSuccess: (payload) => {
      noteBodySaved(payload)
      if (payload.status === 'saved') {
        markMetaPublished()
      }
    },
    onError: (error) => noteError(error.message),
  })
  const unpublishMutation = useMutation({
    mutationFn: unpublishFn,
    onSuccess: (saved) => noteUnpublishSaved(saved),
    onError: (error) => noteError(error.message),
  })

  // --- Mutation pending flags ------------------------------------------------
  const isSubmittingAny =
    upsertMetaMutation.isPending ||
    saveDraftMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending

  // --- Autosave ------------------------------------------------------------
  const [isCreating, setIsCreating] = useState(false)
  const autosaveEnabled = isEditing && conflict === null && !isSubmittingAny
  // The `noteBodySaved` reducer reads from a closure that captures
  // `detail`, `expectedToken`, etc. We mirror it through a ref so the
  // autosave flush always picks up the latest values without forcing
  // every keystroke to recreate the flush callback.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)
  useEffect(() => {
    handleBodySavedRef.current = noteBodySaved
  })

  const flushAutosave = useCallback(
    async (snapshot: PortableTextBody) => {
      if (!isEditing || !detail) {
        return
      }
      try {
        const result = await directSaveDraft({
          id: detail.entity.id,
          body: snapshot,
          expectedClientRevisionToken: expectedToken,
        })
        handleBodySavedRef.current(result)
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : '保存失败')
      }
    },
    [isEditing, detail, expectedToken, directSaveDraft],
  )

  useAutosave({
    body,
    enabled: autosaveEnabled,
    flush: flushAutosave,
    onStatusChange: (autosaveStatus: AutosaveStatus) => {
      if (autosaveStatus.kind === 'saving') {
        setStatus({ kind: 'saving' })
      } else if (autosaveStatus.kind === 'saved') {
        // The flush's own noteBodySaved may have surfaced a save-result
        // warning; the engine's generic 'saved' tick must not hide it.
        setStatus((prev) => (prev.kind === 'warning' ? prev : { kind: 'saved', at: new Date(autosaveStatus.at) }))
      } else if (autosaveStatus.kind === 'retrying') {
        setStatus({ kind: 'error', message: autosaveStatus.message })
      }
    },
  })

  // --- Persist handlers ----------------------------------------------------
  const persistCreate = useCallback(async () => {
    if (isEditing || isCreating) {
      return
    }
    setIsCreating(true)
    setStatus({ kind: 'saving' })

    const publishedAt = localInputValueToIso(meta.publishedAt)
    let savedEntity: TEntity
    try {
      savedEntity = await upsertMetaMutation.mutateAsync(buildUpsertMetaPayload({ meta, publishedAt }))
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
      setIsCreating(false)
      return
    }

    let draftResult: SaveBodyOutput
    try {
      draftResult = await directSaveDraft({
        id: savedEntity.id,
        body,
        expectedClientRevisionToken: null,
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : '保存正文失败',
      })
      setIsCreating(false)
      void navigate(editPath(savedEntity.id), { replace: true })
      return
    }
    if (draftResult.status === 'conflict') {
      setStatus({ kind: 'conflict', expectedToken: draftResult.expectedToken })
      setIsCreating(false)
      void navigate(editPath(savedEntity.id), { replace: true })
      return
    }

    createDraft.migrateToEditKey(savedEntity.id, draftResult.revision.clientRevisionToken, body)
    markBodySaved(draftResult.revision.body)

    setStatus(
      draftResult.warning !== undefined
        ? { kind: 'warning', message: draftResult.warning }
        : { kind: 'saved', at: new Date() },
    )
    setIsCreating(false)
    void navigate(editPath(savedEntity.id), { replace: true })
  }, [
    isEditing,
    isCreating,
    meta,
    body,
    upsertMetaMutation,
    directSaveDraft,
    createDraft,
    buildUpsertMetaPayload,
    editPath,
    navigate,
    markBodySaved,
  ])

  const persistSave = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    const pickerIso = localInputValueToIso(meta.publishedAt)
    const serverIsScheduled = serverPublishedAtIso !== null && (Date.parse(serverPublishedAtIso) || 0) > Date.now()
    const publishedAt = pickerIso !== null ? pickerIso : serverIsScheduled ? new Date().toISOString() : null
    const bodyDiverged = !arePortableTextBodiesEquivalent(body, lastSavedBody)
    beginActionBanner('draft', bodyDiverged ? 2 : 1)
    upsertMetaMutation.mutate(buildUpsertMetaPayload({ meta, id: detail.entity.id, publishedAt }))
    if (bodyDiverged) {
      saveDraftMutation.mutate({
        id: detail.entity.id,
        body,
        expectedClientRevisionToken: expectedToken,
      })
    }
  }, [
    isEditing,
    detail,
    meta,
    body,
    expectedToken,
    serverPublishedAtIso,
    upsertMetaMutation,
    saveDraftMutation,
    buildUpsertMetaPayload,
    beginActionBanner,
    lastSavedBody,
  ])

  const persistPublish = useCallback(() => {
    if (!isEditing || !detail) {
      setStatus({ kind: 'error', message: '请先保存基本信息再发布。' })
      return
    }
    setStatus({ kind: 'saving' })
    const publishedAtIso = localInputValueToIso(meta.publishedAt)
    beginActionBanner('published', 1)
    publishMutation.mutate({
      id: detail.entity.id,
      body,
      expectedClientRevisionToken: expectedToken,
      ...(publishedAtIso !== null ? { publishedAt: publishedAtIso } : {}),
    })
    setServerPublishedAtIso(publishedAtIso ?? new Date().toISOString())
  }, [isEditing, detail, body, expectedToken, meta.publishedAt, publishMutation, beginActionBanner])

  const persistUnpublish = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    unpublishMutation.mutate({ id: detail.entity.id })
  }, [isEditing, detail, unpublishMutation])

  // --- Mutation pending flags ----------------------------------------------
  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending

  return {
    // Owned save-flow state the orchestrator projects into the sidebar and
    // dialog. `setStatus` / `markBodySaved` are returned for the
    // orchestrator's own adoption handlers (local-draft / server-version /
    // revision-history), the only writers outside this module.
    status,
    setStatus,
    displaySaveAtMs,
    lastSavedBody,
    markBodySaved,
    previewBanner,
    dismissPreviewBanner,
    noteBodySaved,
    isPending,
    isSavingDraft,
    isPublishing,
    isUnpublishing,
    isCreating,
    persistCreate,
    persistSave,
    persistPublish,
    persistUnpublish,
  }
}
