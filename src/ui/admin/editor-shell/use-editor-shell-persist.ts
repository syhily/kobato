import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type { SaveBodyOutput } from '@/shared/types/revision'
import type {
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'
import type { ActionBannerController } from '@/ui/admin/editor-shell/use-action-banner'

import { useAutosave, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { localInputValueToIso } from '@/ui/admin/editor-shell/editor-datetime'

/** Live draft snapshot the persist flows read (autosave + the four persist handlers). */
export interface EditorShellPersistDraft<TMeta> {
  meta: TMeta
  body: PortableTextBody
  expectedToken: string | null
  lastSavedBody: PortableTextBody
  serverPublishedAtIso: string | null
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

/** Orchestrator-owned reducers the mutation callbacks report back into. */
export interface EditorShellPersistReducers<TMeta, TEntity> {
  metaDraftFromEntity: (entity: TEntity) => TMeta
  onMetaSaved: (entity: TEntity) => void
  onBodySaved: (payload: SaveBodyOutput) => void
  onUnpublishSaved: (entity: TEntity, freshMeta: TMeta) => void
  noteError: (message: string) => void
  setStatus: React.Dispatch<React.SetStateAction<EditorShellStatus>>
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  setServerPublishedAtIso: React.Dispatch<React.SetStateAction<string | null>>
  markBodySaved: (savedBody: PortableTextBody) => void
}

export interface UseEditorShellPersistArgs<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  isEditing: boolean
  detail?: EditorShellDetail<TEntity>
  draft: EditorShellPersistDraft<TMeta>
  mutations: EditorShellPersistMutations<TMeta, TEntity, TUpsertMetaInput>
  reducers: EditorShellPersistReducers<TMeta, TEntity>
  routing: {
    editPath: (id: string) => string
    navigate: NavigateFunction
  }
  /**
   * Narrow slice of the banner protocol: persist arms the countdown
   * (`begin(kind, legs)`) and owns the leg count — the orchestrator's
   * reducers note and cancel legs through the same controller.
   */
  actionBanner: Pick<ActionBannerController, 'begin'>
  createDraft: { migrateToEditKey: (id: string, token: string, body: PortableTextBody) => void }
}

export function useEditorShellPersist<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellPersistArgs<TMeta, TEntity, TUpsertMetaInput>) {
  const { isEditing, detail, draft, mutations, reducers, routing, actionBanner, createDraft } = args
  const { meta, body, expectedToken, lastSavedBody, serverPublishedAtIso, conflict } = draft
  const { upsertMetaFn, saveDraftFn, publishFn, unpublishFn, buildUpsertMetaPayload, directSaveDraft } = mutations
  const {
    metaDraftFromEntity,
    onMetaSaved,
    onBodySaved,
    onUnpublishSaved,
    noteError,
    setStatus,
    setMeta,
    setServerPublishedAtIso,
    markBodySaved,
  } = reducers
  const { editPath, navigate } = routing
  // Destructured so the persist handlers can dep on the stable callback
  // itself, not on the narrow wrapper object the orchestrator rebuilds.
  const beginActionBanner = actionBanner.begin

  const upsertMetaMutation = useMutation({
    mutationFn: upsertMetaFn,
    onSuccess: (saved) => onMetaSaved(saved),
    onError: (error) => noteError(error.message),
  })
  const saveDraftMutation = useMutation({
    mutationFn: saveDraftFn,
    onSuccess: (payload) => onBodySaved(payload),
    onError: (error) => noteError(error.message),
  })
  const publishMutation = useMutation({
    mutationFn: publishFn,
    onSuccess: (payload) => {
      onBodySaved(payload)
      if (payload.status === 'saved') {
        setMeta((m) => ({ ...m, published: true }))
      }
    },
    onError: (error) => noteError(error.message),
  })
  const unpublishMutation = useMutation({
    mutationFn: unpublishFn,
    onSuccess: (saved) => onUnpublishSaved(saved, metaDraftFromEntity(saved)),
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
  // The `onBodySaved` reducer reads from a closure that captures
  // `detail`, `expectedToken`, etc. We mirror it through a ref so the
  // autosave flush always picks up the latest values without forcing
  // every keystroke to recreate the flush callback.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)
  useEffect(() => {
    handleBodySavedRef.current = onBodySaved
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
        // The flush's own onBodySaved may have surfaced a save-result
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
    setStatus,
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
    setStatus,
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
  }, [
    isEditing,
    detail,
    body,
    expectedToken,
    meta.publishedAt,
    publishMutation,
    setStatus,
    setServerPublishedAtIso,
    beginActionBanner,
  ])

  const persistUnpublish = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    unpublishMutation.mutate({ id: detail.entity.id })
  }, [isEditing, detail, unpublishMutation, setStatus])

  // --- Mutation pending flags ----------------------------------------------
  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending

  return {
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
