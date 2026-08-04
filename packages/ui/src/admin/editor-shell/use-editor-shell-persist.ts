import type { SaveBodyOutput } from '@kobato/shared/contracts/revision'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type {
  ConflictFreezeSource,
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  RevisionLike,
  UseEditorShellStateArgs,
} from '@kobato/ui/admin/editor-shell/editor-shell-types'
import type { NavigateFunction } from 'react-router'

import { useAutosave, type AutosaveFlushOutcome, type AutosaveStatus } from '@kobato/client/hooks/use-autosave'
import { areLexicalBodiesEquivalent } from '@kobato/shared/lexical/canonicalize'
import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { localInputValueToIso } from '@kobato/ui/admin/editor-shell/editor-datetime'
import { deriveBaselineRevision, deriveBaselineUpdatedAtMs } from '@kobato/ui/admin/editor-shell/editor-shell-derived'
import { useActionBanner } from '@kobato/ui/admin/editor-shell/use-action-banner'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Live draft snapshot the persist flows read (autosave + the four persist handlers). */
export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: LexicalBody
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

/**
 * The few writes persist must report into orchestrator-owned state. The meta
 * draft and the revision-token race stay in the orchestrator: the token keys
 * the local-storage draft (`useLocalDraft`), and the freeze that draft feeds
 * into gates autosave here — moving the token into persist would close a
 * hook-ordering cycle between the two modules. The freeze itself is also
 * orchestrator-owned (both of its sources live there); persist only reports
 * the server-revision leg via `noteRevisionConflict`.
 */
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
  createDraft: { migrateToEditKey: (id: string, token: string, body: LexicalBody) => void }
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

  // --- Owned save-flow state -------------------------------------------------
  // Persist flows write these; the orchestrator only projects them into the
  // sidebar / toolbar views. The banner protocol (arm → note legs → show /
  // cancel) never crosses the module boundary. The autosave freeze is NOT
  // here: both its sources are orchestrator-owned and arrive via
  // `draft.freeze` (see the notifications doc).
  const [status, setStatus] = useState<EditorShellStatus>({ kind: 'idle' })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() => deriveBaselineUpdatedAtMs(detail))
  const [lastSavedBody, setLastSavedBody] = useState<LexicalBody>(
    () => deriveBaselineRevision(detail)?.body ?? EMPTY_LEXICAL_BODY,
  )
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(detail?.entity.publishedAt ?? null)
  const {
    banner: previewBanner,
    begin: beginActionBanner,
    noteLeg: noteActionLegSucceeded,
    cancel: cancelActionBanner,
    dismiss: dismissPreviewBanner,
  } = useActionBanner()

  // Body snapshot submitted by the in-flight manual body save
  // (persistSave's body leg / persistPublish). On its success the autosave
  // baseline advances to it, so the next debounce tick's reference check
  // short-circuits instead of re-PATCHing the same body. Cleared on any
  // save outcome and on error so a stale snapshot never marks an
  // unpersisted body as saved.
  const manualSaveBodyRef = useRef<LexicalBody | null>(null)

  // Server publishedAt captured right before persistPublish's optimistic
  // overwrite, so a failed publish can restore the pre-publish truth instead
  // of leaving the optimistic value behind — a leftover future date would
  // make a later picker-clear save send `publishedAt: null` (the server's
  // cancel-schedule signal) and silently unpublish a live entity.
  const publishedAtBeforePublishRef = useRef<string | null>(null)

  const markBodySaved = useCallback((savedBody: LexicalBody) => {
    setLastSavedBody(savedBody)
  }, [])

  // --- Mutation reducers (module-private) ------------------------------------
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
      // A save round runs the meta and body legs concurrently; when the body
      // leg already landed with a warning or a conflict, the meta leg must
      // not hide it.
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

  // Mirror of the autosave engine's `markPersisted` (the engine is mounted
  // further down, after these reducers are defined — same pattern as
  // `handleBodySavedRef` below).
  const markPersistedRef = useRef<(body: LexicalBody) => void>(() => undefined)

  // Advance the engine baseline for a body persisted outside both the engine
  // and the manual-save flow — the orchestrator's adoptLocalDraft force-save.
  // Without it the next debounce tick re-PATCHes the adopted body (and
  // rotates the revision token server-side for nothing).
  const noteBodyPersisted = useCallback((persistedBody: LexicalBody) => {
    markPersistedRef.current(persistedBody)
  }, [])

  const noteBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      if (payload.status === 'conflict') {
        // Freeze autosave via the orchestrator's `server`-sourced freeze:
        // the expected token can never advance while the server keeps
        // rejecting it, and the engine must not clobber this status with a
        // generic `saved` tick. The freeze clears on the next clean save
        // (the orchestrator resets it in `noteRevisionSaved`).
        manualSaveBodyRef.current = null
        noteRevisionConflict()
        setStatus({ kind: 'conflict', expectedToken: payload.expectedToken })
        cancelActionBanner()
        return
      }
      if (manualSaveBodyRef.current !== null) {
        // A manual save just persisted this exact body snapshot outside the
        // engine — advance the engine baseline so the next debounce tick
        // short-circuits instead of re-PATCHing it.
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
      // Same concurrent-leg rule as noteMetaSaved: an in-flight body leg may
      // have surfaced a warning / conflict while unpublish was pending.
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
      // The publish never landed: revert the optimistic server publishedAt
      // persistPublish just applied, back to the pre-publish truth (the next
      // meta save re-syncs it via noteMetaSaved). Only this optimistic write
      // is rolled back — the user's picker input lives in the meta draft and
      // stays untouched.
      setServerPublishedAtIso(publishedAtBeforePublishRef.current)
      noteError(error.message)
    },
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
  const autosaveEnabled = isEditing && freeze === null && !isSubmittingAny
  // The `noteBodySaved` reducer reads from a closure that captures
  // `detail`, `expectedToken`, etc. We mirror it through a ref so the
  // autosave flush always picks up the latest values without forcing
  // every keystroke to recreate the flush callback.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)
  useEffect(() => {
    handleBodySavedRef.current = noteBodySaved
  })

  const flushAutosave = useCallback(
    async (snapshot: LexicalBody): Promise<AutosaveFlushOutcome> => {
      if (!isEditing || !detail) {
        // Unreachable while `enabled` gates on isEditing; treat as a no-op
        // save so the engine's bookkeeping stays consistent.
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
        // The flush's own noteBodySaved may have surfaced a save-result
        // warning or a revision conflict; the engine's generic 'saved'
        // tick must not hide either. (The engine no longer emits 'saved'
        // for a conflicted flush at all — this is the belt-and-suspenders
        // guard against regressions.)
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
  // the editor mounts with server state, so the first debounce tick with zero
  // edits must hit the reference check and no-op instead of firing an
  // unconditional PATCH (which also rotates the revision token server-side
  // and orphans the previous IndexedDB draft — P1-15). Seeded once per edit
  // session: later body changes are real edits the engine must flush.
  const seededOpeningBodyRef = useRef(false)
  useEffect(() => {
    if (!isEditing || seededOpeningBodyRef.current) {
      return
    }
    seededOpeningBodyRef.current = true
    markPersistedRef.current(body)
    // markPersistedRef is synced by the effect above; the ref guard keeps
    // the seed once-only even though this re-runs on every body change.
  }, [isEditing, body])

  // --- Persist handlers ----------------------------------------------------
  const persistCreate = useCallback(async () => {
    if (isEditing || isCreating) {
      return
    }
    setIsCreating(true)
    setStatus({ kind: 'saving' })

    // `null` (empty picker) means "no schedule supplied" on create — omit
    // the field so the server applies its default instead of reading it as
    // the cancel-schedule signal.
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
    // Picker cleared while the server still holds a schedule: send an
    // explicit `null` — the cancel-schedule signal, keeping the entity
    // unpublished — instead of forcing it live with `new Date()`. With no
    // schedule to cancel the field is omitted entirely (leave untouched).
    const publishedAt = pickerIso ?? (serverIsScheduled ? null : undefined)
    const bodyDiverged = !areLexicalBodiesEquivalent(body, lastSavedBody)
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
