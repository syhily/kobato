import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SaveBodyOutput } from '@/shared/contracts/revision'
import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  ConflictFreezeSource,
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  RevisionLike,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useAutosave, type AutosaveFlushOutcome, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { localInputValueToIso } from '@/ui/admin/editor-shell/editor-datetime'
import { deriveBaselineRevision, deriveBaselineUpdatedAtMs } from '@/ui/admin/editor-shell/editor-shell-derived'
import { useActionBanner } from '@/ui/admin/editor-shell/use-action-banner'

/** Live draft snapshot the persist flows read (autosave + the four persist handlers). */
export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: PortableTextBody
  expectedToken: string | null
  /** The merged autosave freeze (orchestrator-owned; `null` = saving allowed). */
  freeze: ConflictFreezeSource | null
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

/** The few writes persist must report into orchestrator-owned state; the
 *  revision token stays here — moving it would close a hook-ordering cycle. */
export interface EditorShellPersistNotifications<TMeta> {
  /** Adopt the server-confirmed meta draft after a meta save / unpublish. */
  applyServerMeta: (meta: TMeta) => void
  /** Flip the local meta draft's `published` flag after a successful publish. */
  markMetaPublished: () => void
  /** Advance the revision race (expected token + latest/published) after a body save. */
  noteRevisionSaved: (revision: RevisionLike) => void
  /** Set the `server`-sourced autosave freeze after a revision conflict. */
  noteRevisionConflict: () => void
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
  const { meta, body, expectedToken, freeze } = draft
  const { upsertMetaFn, saveDraftFn, publishFn, unpublishFn, buildUpsertMetaPayload, directSaveDraft } = mutations
  const { applyServerMeta, markMetaPublished, noteRevisionSaved, noteRevisionConflict } = notifications
  const { editPath, navigate } = routing
  const isEditing = detail !== undefined

  // Persist-owned state. The autosave freeze is NOT here — both its sources
  // are orchestrator-owned and arrive via `draft.freeze`.
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

  // Body snapshot of the in-flight manual save; on success the autosave
  // baseline advances to it so the next debounce tick short-circuits.
  const manualSaveBodyRef = useRef<PortableTextBody | null>(null)

  // Pre-publish `publishedAt` for rollback on a failed publish — a leftover
  // optimistic future date would make a picker-clear save silently unpublish.
  const publishedAtBeforePublishRef = useRef<string | null>(null)

  const markBodySaved = useCallback((savedBody: PortableTextBody) => {
    setLastSavedBody(savedBody)
  }, [])

  const noteError = useCallback(
    (message: string) => {
      manualSaveBodyRef.current = null
      setStatus({ kind: 'error', message })
      cancelActionBanner()
    },
    [cancelActionBanner],
  )

  const noteMetaSaved = useCallback(
    (saved: TEntity) => {
      // A concurrent body leg's warning / conflict must not be hidden.
      setStatus((prev) =>
        prev.kind === 'warning' || prev.kind === 'conflict' ? prev : { kind: 'saved', at: new Date() },
      )
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

  // Mirror of the engine's `markPersisted` — the engine mounts further down (see `handleBodySavedRef`).
  const markPersistedRef = useRef<(body: PortableTextBody) => void>(() => undefined)

  // Advance the engine baseline for a body persisted outside engine + manual-save flows (adoptLocalDraft force-save).
  const noteBodyPersisted = useCallback((persistedBody: PortableTextBody) => {
    markPersistedRef.current(persistedBody)
  }, [])

  const noteBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      if (payload.status === 'conflict') {
        // Freeze autosave: the token can never advance while the server
        // rejects it, and the engine must not clobber this status with a
        // generic `saved` tick.
        manualSaveBodyRef.current = null
        noteRevisionConflict()
        setStatus({ kind: 'conflict', expectedToken: payload.expectedToken })
        cancelActionBanner()
        return
      }
      if (manualSaveBodyRef.current !== null) {
        // A manual save just persisted this exact snapshot — advance the engine baseline.
        markPersistedRef.current(manualSaveBodyRef.current)
        manualSaveBodyRef.current = null
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
    [
      meta.slug,
      detail,
      cancelActionBanner,
      noteActionLegSucceeded,
      noteRevisionSaved,
      noteRevisionConflict,
      markBodySaved,
    ],
  )

  const noteUnpublishSaved = useCallback(
    (saved: TEntity) => {
      // Same concurrent-leg rule as noteMetaSaved.
      setStatus((prev) =>
        prev.kind === 'warning' || prev.kind === 'conflict' ? prev : { kind: 'saved', at: new Date() },
      )
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
    onError: (error) => {
      // Publish never landed: roll back the optimistic server publishedAt to
      // the pre-publish truth; the user's picker input stays untouched.
      setServerPublishedAtIso(publishedAtBeforePublishRef.current)
      noteError(error.message)
    },
  })
  const unpublishMutation = useMutation({
    mutationFn: unpublishFn,
    onSuccess: (saved) => noteUnpublishSaved(saved),
    onError: (error) => noteError(error.message),
  })

  const isSubmittingAny =
    upsertMetaMutation.isPending ||
    saveDraftMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending

  const [isCreating, setIsCreating] = useState(false)
  const autosaveEnabled = isEditing && freeze === null && !isSubmittingAny
  // Mirror `noteBodySaved` through a ref so the flush picks up the latest
  // closure values without recreating the callback every keystroke.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)
  useEffect(() => {
    handleBodySavedRef.current = noteBodySaved
  })

  const flushAutosave = useCallback(
    async (snapshot: PortableTextBody): Promise<AutosaveFlushOutcome> => {
      if (!isEditing || !detail) {
        // Unreachable while `enabled` gates on isEditing — no-op keeps the engine's bookkeeping consistent.
        return 'saved'
      }
      try {
        const result = await directSaveDraft({
          id: detail.entity.id,
          body: snapshot,
          expectedClientRevisionToken: expectedToken,
        })
        handleBodySavedRef.current(result)
        return result.status === 'conflict' ? 'conflict' : 'saved'
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : '保存失败')
      }
    },
    [isEditing, detail, expectedToken, directSaveDraft],
  )

  const { markPersisted: markAutosavePersisted } = useAutosave({
    body,
    enabled: autosaveEnabled,
    flush: flushAutosave,
    onStatusChange: (autosaveStatus: AutosaveStatus) => {
      if (autosaveStatus.kind === 'saving') {
        setStatus({ kind: 'saving' })
      } else if (autosaveStatus.kind === 'saved') {
        // The flush's own noteBodySaved may have surfaced a warning / conflict —
        // the engine's generic 'saved' tick must not hide either.
        setStatus((prev) =>
          prev.kind === 'warning' || prev.kind === 'conflict'
            ? prev
            : { kind: 'saved', at: new Date(autosaveStatus.at) },
        )
      } else if (autosaveStatus.kind === 'retrying') {
        setStatus({ kind: 'error', message: autosaveStatus.message })
      }
    },
  })

  useEffect(() => {
    markPersistedRef.current = markAutosavePersisted
  }, [markAutosavePersisted])

  // Seed the engine's persisted baseline with the opening body (audit P1-1):
  // the first debounce tick with zero edits must no-op instead of firing an
  // unconditional PATCH (which rotates the token and orphans the IndexedDB draft — P1-15).
  const seededOpeningBodyRef = useRef(false)
  useEffect(() => {
    if (!isEditing || seededOpeningBodyRef.current) {
      return
    }
    seededOpeningBodyRef.current = true
    markPersistedRef.current(body)
    // Ref guard keeps the seed once-only; this re-runs on every body change.
  }, [isEditing, body])

  const persistCreate = useCallback(async () => {
    if (isEditing || isCreating) {
      return
    }
    setIsCreating(true)
    setStatus({ kind: 'saving' })

    // `null` (empty picker) means "no schedule supplied" on create — omit the
    // field so the server applies its default instead of the cancel-schedule signal.
    const publishedAt = localInputValueToIso(meta.publishedAt) ?? undefined
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
      noteRevisionConflict()
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
    noteRevisionConflict,
  ])

  const persistSave = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    const pickerIso = localInputValueToIso(meta.publishedAt)
    const serverIsScheduled = serverPublishedAtIso !== null && (Date.parse(serverPublishedAtIso) || 0) > Date.now()
    // Picker cleared while the server holds a schedule: send explicit `null`
    // (the cancel-schedule signal); with no schedule the field is omitted.
    const publishedAt = pickerIso ?? (serverIsScheduled ? null : undefined)
    const bodyDiverged = !arePortableTextBodiesEquivalent(body, lastSavedBody)
    beginActionBanner('draft', bodyDiverged ? 2 : 1)
    upsertMetaMutation.mutate(buildUpsertMetaPayload({ meta, id: detail.entity.id, publishedAt }))
    if (bodyDiverged) {
      manualSaveBodyRef.current = body
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
    manualSaveBodyRef.current = body
    publishMutation.mutate({
      id: detail.entity.id,
      body,
      expectedClientRevisionToken: expectedToken,
      ...(publishedAtIso !== null ? { publishedAt: publishedAtIso } : {}),
    })
    publishedAtBeforePublishRef.current = serverPublishedAtIso
    setServerPublishedAtIso(publishedAtIso ?? new Date().toISOString())
  }, [
    isEditing,
    detail,
    body,
    expectedToken,
    meta.publishedAt,
    serverPublishedAtIso,
    publishMutation,
    beginActionBanner,
  ])

  const persistUnpublish = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    unpublishMutation.mutate({ id: detail.entity.id })
  }, [isEditing, detail, unpublishMutation])

  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending

  return {
    // Owned save-flow state; `setStatus` / `markBodySaved` are returned for
    // the orchestrator's adoption handlers — the only writers outside this module.
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
  }
}
