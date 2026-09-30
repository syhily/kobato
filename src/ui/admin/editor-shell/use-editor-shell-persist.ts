// The persist orchestrator of the editor shell: composes the focused slices
// (each a sibling module) and owns the wiring between them —
//
// - `use-editor-shell-persist-race` — the revision-token race (expected
//   token + latest/published) and the `server` autosave freeze leg.
// - `use-editor-shell-persist-conflict` — the IndexedDB local-draft session
//   and the `local` freeze leg (a diverging stored draft until the dialog
//   resolves it).
// - `use-editor-shell-persist-mutations` — the four wire mutations and their
//   note* interpreters.
// - `editor-shell-persist-plan` — the pure wire/status planners every flow
//   applies verbatim (no decisions here).
//
// Owned here: the save-flow status + baselines, the action banner, the
// autosave engine wiring (`useAutosave` is the sole baseline owner behind
// `setBaseline`), the `handleBodySavedRef` mirror that breaks the
// declaration cycle between the mutations and the engine's `setBaseline`,
// the four persist handlers, and the conflict/revision adoption flows.

import type { NavigateFunction } from 'react-router'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { SaveBodyOutput } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type {
  ConflictFreezeSource,
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useAutosave, type AutosaveFlushOutcome, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { areLexicalEditorStatesEquivalent } from '@/shared/lexical/equivalence'
import { EMPTY_LEXICAL_EDITOR_STATE } from '@/shared/lexical/schema'
import { deriveBaselineRevision, deriveBaselineUpdatedAtMs } from '@/ui/admin/editor-shell/editor-shell-derived'
import {
  planBodySave,
  planCreatePublishedAt,
  planDraftSave,
  planPublish,
  verdictBodySave,
} from '@/ui/admin/editor-shell/editor-shell-persist-plan'
import { useActionBanner } from '@/ui/admin/editor-shell/use-action-banner'
import { useEditorShellPersistConflict } from '@/ui/admin/editor-shell/use-editor-shell-persist-conflict'
import { useEditorShellPersistMutations } from '@/ui/admin/editor-shell/use-editor-shell-persist-mutations'
import { useEditorShellPersistRace } from '@/ui/admin/editor-shell/use-editor-shell-persist-race'

/** Live draft snapshot the persist flows read (autosave + the four persist handlers). */
export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: LexicalEditorState
  /** Opening body the server holds — the local-conflict baseline and the dialog's server version. */
  initialBody: LexicalEditorState
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

/** The few writes persist must report into orchestrator-owned state. The
 *  revision race (expected token + latest/published), both freeze legs, and
 *  the local-draft conflict are owned HERE — the split that once dodged a
 *  hook-ordering cycle is gone: persist drives the local-draft session
 *  itself (via `use-editor-shell-persist-conflict`), so the token it owns
 *  feeds the draft key and the conflict it detects feeds the freeze with no
 *  render-input round-trip. */
export interface EditorShellPersistNotifications<TMeta> {
  /** Adopt the server-confirmed meta draft after a meta save / unpublish. */
  applyServerMeta: (meta: TMeta) => void
  /** Flip the local meta draft's `published` flag after a successful publish. */
  markMetaPublished: () => void
  /** Replace the editor body + remount key (draft/conflict adoption flows). */
  replaceBody: (body: LexicalEditorState, key: string) => void
}

export interface UseEditorShellPersistArgs<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  /** Pre-loaded detail; `undefined` means create mode — every edit flow gates on it. */
  detail?: EditorShellDetail<TEntity>
  draft: EditorShellPersistDraft<TMeta>
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  mutations: EditorShellPersistMutations<TMeta, TEntity, TUpsertMetaInput>
  /** Entity → meta-draft projection, straight from `UseEditorShellStateArgs`. */
  metaDraftFromEntity: (entity: TEntity) => TMeta
  notifications: EditorShellPersistNotifications<TMeta>
  routing: {
    editPath: (id: string) => string
    navigate: NavigateFunction
  }
  createDraft: { migrateToEditKey: (id: string, token: string, body: LexicalEditorState) => void }
}

export function useEditorShellPersist<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellPersistArgs<TMeta, TEntity, TUpsertMetaInput>) {
  const { detail, draft, localDraftConfig, mutations, metaDraftFromEntity, notifications, routing, createDraft } = args
  const { meta, body, initialBody } = draft
  const { upsertMetaFn, saveDraftFn, publishFn, unpublishFn, buildUpsertMetaPayload, directSaveDraft } = mutations
  const { applyServerMeta, markMetaPublished, replaceBody } = notifications
  const { editPath, navigate } = routing
  const isEditing = detail !== undefined

  // Owned save-flow status + baselines; the mutation slice reports through
  // these setters.
  const [status, setStatus] = useState<EditorShellStatus>({ kind: 'idle' })
  const [displaySaveAtMs, setDisplaySaveAtMs] = useState<number | null>(() => deriveBaselineUpdatedAtMs(detail))
  const [lastSavedBody, setLastSavedBody] = useState<LexicalEditorState>(
    () => deriveBaselineRevision(detail)?.body ?? EMPTY_LEXICAL_EDITOR_STATE,
  )
  const [serverPublishedAtIso, setServerPublishedAtIso] = useState<string | null>(detail?.entity.publishedAt ?? null)

  const {
    banner: previewBanner,
    begin: beginActionBanner,
    noteLeg: noteActionLegSucceeded,
    cancel: cancelActionBanner,
    dismiss: dismissPreviewBanner,
  } = useActionBanner()

  // Owned revision race (expected token + latest/published) + the `server`
  // freeze leg.
  const { expectedToken, latestRevision, publishedRevision, serverConflicted, updateAfterSave, noteServerConflict } =
    useEditorShellPersistRace(detail)

  // Owned local-draft session + conflict detection (the `local` freeze leg).
  const { conflict, clearLocalDraft, resolveConflict } = useEditorShellPersistConflict({
    localDraftConfig,
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
    initialBody,
  })

  // The merged autosave freeze: one gate, two owned sources; the local leg
  // wins the `source` label when both are set.
  const freeze: ConflictFreezeSource | null = conflict !== null ? 'local' : serverConflicted ? 'server' : null

  // Body snapshot of the in-flight manual save; on success the autosave
  // baseline advances to it so the next debounce tick short-circuits.
  const manualSaveBodyRef = useRef<LexicalEditorState | null>(null)

  // Pre-publish `publishedAt` for rollback on a failed publish — a leftover
  // optimistic future date would make a picker-clear save silently unpublish.
  const publishedAtBeforePublishRef = useRef<string | null>(null)

  // The single mirror that breaks the declaration cycle: the body mutations
  // and the autosave flush are declared before `noteBodySaved` (which reads
  // the engine's `setBaseline`), so they reach it through this ref. The
  // effect below keeps it pointing at the latest closure.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)

  const { upsertMetaMutation, saveDraftMutation, publishMutation, unpublishMutation, isSubmittingAny } =
    useEditorShellPersistMutations({
      upsertMetaFn,
      saveDraftFn,
      publishFn,
      unpublishFn,
      metaDraftFromEntity,
      applyServerMeta,
      markMetaPublished,
      setStatus,
      setDisplaySaveAtMs,
      setServerPublishedAtIso,
      noteActionLegSucceeded,
      cancelActionBanner,
      dismissPreviewBanner,
      manualSaveBodyRef,
      publishedAtBeforePublishRef,
      handleBodySavedRef,
    })

  const [isCreating, setIsCreating] = useState(false)

  const flushAutosave = useCallback(
    async (snapshot: LexicalEditorState): Promise<AutosaveFlushOutcome> => {
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
        return verdictBodySave(result).kind === 'conflict' ? 'conflict' : 'saved'
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : '保存失败', { cause: error })
      }
    },
    [isEditing, detail, expectedToken, directSaveDraft],
  )

  // Opening-body baseline seed, captured once at mount (audit P1-1): the
  // first debounce tick with zero edits no-ops instead of firing an
  // unconditional PATCH (which rotates the token and orphans the IndexedDB
  // draft — P1-15). Mount-captured state makes the once-only seed structural.
  const [openingBaseline] = useState<LexicalEditorState | null>(() => (isEditing ? body : null))

  const { setBaseline } = useAutosave({
    body,
    enabled: isEditing && freeze === null && !isSubmittingAny,
    flush: flushAutosave,
    initialBaseline: openingBaseline,
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

  // Apply the pure save plan (editor-shell-persist-plan): status transition,
  // freeze leg, baseline advance, revision race — no decisions here.
  const noteBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      const plan = planBodySave(payload, manualSaveBodyRef.current, new Date())
      if (plan.kind === 'conflict') {
        // Freeze autosave: the token can never advance while the server
        // rejects it, and the engine must not clobber this status with a
        // generic `saved` tick.
        manualSaveBodyRef.current = null
        noteServerConflict()
        setStatus({ kind: 'conflict', expectedToken: plan.expectedToken })
        cancelActionBanner()
        return
      }
      if (plan.consumePendingSnapshot && manualSaveBodyRef.current !== null) {
        // A manual save just persisted this exact snapshot — advance the engine baseline.
        setBaseline(manualSaveBodyRef.current)
      }
      manualSaveBodyRef.current = null
      setStatus(plan.status)
      const saveMs = Date.parse(plan.revision.updatedAt)
      if (!Number.isNaN(saveMs)) {
        setDisplaySaveAtMs(saveMs)
      }
      const slugForBanner = meta.slug.trim() === '' ? (detail?.entity.slug ?? '') : meta.slug.trim()
      noteActionLegSucceeded(slugForBanner)
      updateAfterSave(plan.revision)
      setLastSavedBody(plan.revision.body)
    },
    [meta.slug, detail, cancelActionBanner, noteActionLegSucceeded, updateAfterSave, noteServerConflict, setBaseline],
  )

  useEffect(() => {
    handleBodySavedRef.current = noteBodySaved
  })

  const persistCreate = useCallback(async () => {
    if (isEditing || isCreating) {
      return
    }
    setIsCreating(true)
    setStatus({ kind: 'saving' })

    const publishedAt = planCreatePublishedAt(meta.publishedAt)
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
    const verdict = verdictBodySave(draftResult)
    if (verdict.kind === 'conflict') {
      noteServerConflict()
      setStatus({ kind: 'conflict', expectedToken: verdict.expectedToken })
      setIsCreating(false)
      void navigate(editPath(savedEntity.id), { replace: true })
      return
    }

    createDraft.migrateToEditKey(savedEntity.id, verdict.revision.clientRevisionToken, body)
    setLastSavedBody(verdict.revision.body)

    setStatus(
      verdict.warning !== undefined ? { kind: 'warning', message: verdict.warning } : { kind: 'saved', at: new Date() },
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
    noteServerConflict,
    editPath,
    navigate,
  ])

  const persistSave = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    const plan = planDraftSave({
      pickerPublishedAt: meta.publishedAt,
      serverPublishedAtIso,
      now: Date.now(),
      body,
      lastSavedBody,
    })
    beginActionBanner('draft', plan.bannerLegs)
    upsertMetaMutation.mutate(buildUpsertMetaPayload({ meta, id: detail.entity.id, publishedAt: plan.publishedAt }))
    if (plan.bodyDiverged) {
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
    const plan = planPublish({ pickerPublishedAt: meta.publishedAt, nowIso: new Date().toISOString() })
    beginActionBanner('published', 1)
    manualSaveBodyRef.current = body
    publishMutation.mutate({
      id: detail.entity.id,
      body,
      expectedClientRevisionToken: expectedToken,
      ...(plan.publishedAtField !== undefined ? { publishedAt: plan.publishedAtField } : {}),
    })
    publishedAtBeforePublishRef.current = serverPublishedAtIso
    setServerPublishedAtIso(plan.optimisticServerPublishedAtIso)
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

  const adoptLocalDraft = useCallback(async () => {
    if (conflict === null || !isEditing || !detail) {
      return
    }
    replaceBody(conflict.localBody, `${detail.entity.id}:adopt-local:${Date.now()}`)
    resolveConflict()
    setStatus({ kind: 'saving' })
    try {
      const result = await directSaveDraft({
        id: detail.entity.id,
        body: conflict.localBody,
        expectedClientRevisionToken: expectedToken,
        force: true,
      })
      handleBodySavedRef.current(result)
      if (verdictBodySave(result).kind === 'saved') {
        // Advance the autosave baseline to the adopted body so the next debounce tick short-circuits.
        setBaseline(conflict.localBody)
      }
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }, [conflict, isEditing, detail, expectedToken, directSaveDraft, setBaseline, replaceBody, resolveConflict])

  const adoptServerVersion = useCallback(() => {
    replaceBody(initialBody, `${detail?.entity.id ?? 'new'}:adopt-server:${Date.now()}`)
    setLastSavedBody(initialBody)
    clearLocalDraft()
    resolveConflict()
  }, [initialBody, detail, clearLocalDraft, replaceBody, resolveConflict])

  const adoptRevisionFromHistory = useCallback(
    (revision: { body: LexicalEditorState; revisionNo: number }) => {
      if (!isEditing || !detail) {
        return
      }
      replaceBody(revision.body, `${detail.entity.id}:adopt-revision:${revision.revisionNo}:${Date.now()}`)
      setStatus({ kind: 'info', message: `已载入 R${revision.revisionNo}，记得保存或发布以生效。` })
    },
    [isEditing, detail, replaceBody],
  )

  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending
  const isBodyDirty = !areLexicalEditorStatesEquivalent(body, lastSavedBody)

  return {
    // Save-flow status and the derived flags the toolbar/sidebar render.
    status,
    displaySaveAtMs,
    isBodyDirty,
    previewBanner,
    dismissPreviewBanner,
    isPending,
    isSavingDraft,
    isPublishing,
    isUnpublishing,
    isCreating,
    // The four persist handlers.
    persistCreate,
    persistSave,
    persistPublish,
    persistUnpublish,
    // Owned revision race, exposed read-only for the sidebar + publish state.
    expectedToken,
    latestRevision,
    publishedRevision,
    // Owned local-conflict state + adoption handlers for the dialog/sidebar.
    conflict,
    adoptLocalDraft,
    adoptServerVersion,
    adoptRevisionFromHistory,
  }
}
