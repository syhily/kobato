import type { SaveBodyOutput } from '@kobato/contracts/revision.ts'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema.ts'
import type { LocalDraftConfig } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts'
import type {
  ConflictFreezeSource,
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  UseEditorShellStateArgs,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'
import type { NavigateFunction } from 'react-router'

import { areLexicalEditorStatesEquivalent } from '@kobato/inkling/headless/equivalence.ts'
import { EMPTY_LEXICAL_EDITOR_STATE } from '@kobato/inkling/headless/schema.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import {
  useAutosave,
  type AutosaveFlushOutcome,
  type AutosaveStatus,
} from '@kobato/web-admin/ui/editor-shell/drafts/use-autosave.ts'
import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-derived.ts'
import {
  planBodySave,
  planCreatePublishedAt,
  planDraftSave,
  planPublish,
  verdictBodySave,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-persist-plan.ts'
import { useActionBanner } from '@kobato/web-admin/ui/editor-shell/use-action-banner.ts'
import { useEditorShellPersistConflict } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist-conflict.ts'
import { useEditorShellPersistMutations } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist-mutations.ts'
import { useEditorShellPersistRace } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist-race.ts'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: LexicalEditorState
  /** Opening body the server holds — the local-conflict baseline and the dialog's server version. */
  initialBody: LexicalEditorState
}

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

export interface EditorShellPersistNotifications<TMeta> {
  applyServerMeta: (meta: TMeta) => void
  /** Flip the local meta draft's `published` flag after a successful publish. */
  markMetaPublished: () => void
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
  const { t } = useI18n()
  const { detail, draft, localDraftConfig, mutations, metaDraftFromEntity, notifications, routing, createDraft } = args
  const { meta, body, initialBody } = draft
  const { upsertMetaFn, saveDraftFn, publishFn, unpublishFn, buildUpsertMetaPayload, directSaveDraft } = mutations
  const { applyServerMeta, markMetaPublished, replaceBody } = notifications
  const { editPath, navigate } = routing
  const isEditing = detail !== undefined

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

  const { expectedToken, latestRevision, publishedRevision, serverConflicted, updateAfterSave, noteServerConflict } =
    useEditorShellPersistRace(detail)

  const { conflict, clearLocalDraft, resolveConflict } = useEditorShellPersistConflict({
    localDraftConfig,
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
    initialBody,
  })

  const freeze: ConflictFreezeSource | null = conflict !== null ? 'local' : serverConflicted ? 'server' : null

  const manualSaveBodyRef = useRef<LexicalEditorState | null>(null)

  const publishedAtBeforePublishRef = useRef<string | null>(null)

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
        throw new Error(error instanceof Error ? error.message : t('admin.editor.persist.saveFailed'), {
          cause: error,
        })
      }
    },
    [isEditing, detail, expectedToken, directSaveDraft, t],
  )

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

  const noteBodySaved = useCallback(
    (payload: SaveBodyOutput) => {
      const plan = planBodySave(payload, manualSaveBodyRef.current, new Date())
      if (plan.kind === 'conflict') {
        manualSaveBodyRef.current = null
        noteServerConflict()
        setStatus({ kind: 'conflict', expectedToken: plan.expectedToken })
        cancelActionBanner()
        return
      }
      if (plan.consumePendingSnapshot && manualSaveBodyRef.current !== null) {
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
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : t('admin.editor.persist.saveFailed'),
      })
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
        message: error instanceof Error ? error.message : t('admin.editor.persist.saveBodyFailed'),
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
    t,
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
      setStatus({ kind: 'error', message: t('admin.editor.persist.saveMetaFirst') })
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
    t,
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
        setBaseline(conflict.localBody)
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : t('admin.editor.persist.saveFailed'),
      })
    }
  }, [conflict, isEditing, detail, expectedToken, directSaveDraft, setBaseline, replaceBody, resolveConflict, t])

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
      setStatus({
        kind: 'info',
        message: t('admin.editor.persist.revisionLoaded', { revision: revision.revisionNo }),
      })
    },
    [isEditing, detail, replaceBody, t],
  )

  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending
  const isBodyDirty = !areLexicalEditorStatesEquivalent(body, lastSavedBody)

  return {
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
    persistCreate,
    persistSave,
    persistPublish,
    persistUnpublish,
    expectedToken,
    latestRevision,
    publishedRevision,
    conflict,
    adoptLocalDraft,
    adoptServerVersion,
    adoptRevisionFromHistory,
  }
}
