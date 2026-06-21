import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'
import type {
  EditorBody,
  EditorShellStatus,
  EntityLike,
  RevisionLike,
  SaveBodyOutput,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useAutosave, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { areInklingDocumentsEquivalent } from '@/shared/inkling/normalize'
import { isPendingForAutosave } from '@/ui/admin/editor-shell/editor-shell-derived'

function localInputValueToIso(localValue: string): string | null {
  if (localValue === '') {
    return null
  }
  const ms = Date.parse(localValue)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

export function useEditorShellPersist<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: {
  isEditing: boolean
  meta: TMeta
  body: EditorBody
  expectedToken: string | null
  detail?: {
    entity: TEntity
    latestRevision: RevisionLike | null
    publishedRevision: RevisionLike | null
  }
  serverPublishedAtIso: string | null
  conflict: { localBody: EditorBody; localSavedAt: number } | null

  upsertMetaFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['upsertMetaFn']
  saveDraftFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['saveDraftFn']
  publishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['publishFn']
  unpublishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['unpublishFn']
  buildUpsertMetaPayload: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['buildUpsertMetaPayload']
  directSaveDraft: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['directSaveDraft']
  editPath: (id: string) => string
  navigate: NavigateFunction
  metaDraftFromEntity: (entity: TEntity) => TMeta

  onMetaSaved: (entity: TEntity) => void
  onBodySaved: (payload: SaveBodyOutput) => void
  onUnpublishSaved: (entity: TEntity, freshMeta: TMeta) => void
  noteError: (message: string) => void

  /**
   * Synchronously flush the editor's pending (debounced) edits and return the
   * resulting document. When provided, every persist handler calls this first
   * and uses the returned document for the mutation body — closing the window
   * where a save/publish fired inside the change-plugin's 120ms debounce and
   * silently dropped the last edits (and, in article mode, all footnote
   * definitions which live only in the provider's parallel state). Returns
   * `null` when the editor hasn't mounted or the document is invalid, in
   * which case the caller falls back to the React-state `body`.
   */
  flushEditor?: () => InklingDocument | null

  setStatus: React.Dispatch<React.SetStateAction<EditorShellStatus>>
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  setServerPublishedAtIso: React.Dispatch<React.SetStateAction<string | null>>

  lastSavedBody: EditorBody
  markBodySaved: (savedBody: EditorBody) => void
  pendingActionRef: React.RefObject<{ kind: 'draft' | 'published'; remaining: number } | null>
  createDraft: { migrateToEditKey: (id: string, token: string, body: EditorBody) => void }
}) {
  const {
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
    flushEditor,
    setStatus,
    setMeta,
    setServerPublishedAtIso,
    lastSavedBody,
    markBodySaved,
    pendingActionRef,
    createDraft,
  } = args

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

  // --- Autosave ------------------------------------------------------------
  const autosaveEnabled =
    isEditing &&
    conflict === null &&
    !isPendingForAutosave({
      upsertMetaApi: upsertMetaMutation,
      saveDraftApi: saveDraftMutation,
      publishApi: publishMutation,
      unpublishApi: unpublishMutation,
    })
  // The `onBodySaved` reducer reads from a closure that captures
  // `detail`, `expectedToken`, etc. We mirror it through a ref so the
  // autosave flush always picks up the latest values without forcing
  // every keystroke to recreate the flush callback.
  const handleBodySavedRef = useRef<(payload: SaveBodyOutput) => void>(() => undefined)
  useEffect(() => {
    handleBodySavedRef.current = onBodySaved
  })

  const flushAutosave = useCallback(
    async (snapshot: EditorBody) => {
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
        setStatus({ kind: 'saved', at: new Date(autosaveStatus.at) })
      } else if (autosaveStatus.kind === 'retrying') {
        setStatus({ kind: 'error', message: autosaveStatus.message })
      }
    },
  })

  // --- Persist handlers ----------------------------------------------------
  const [isCreating, setIsCreating] = useState(false)

  /**
   * Resolve the freshest body to persist. We MUST flush the editor before
   * reading: the change plugin coalesces edits on a 120ms trailing debounce,
   * so `body` (React state set by `onChange`) can lag the editor by one debounce
   * window. For article mode this is especially dangerous — footnote
   * definitions live only in the provider's parallel state and are merged into
   * the document by that debounced flush, so a publish inside the window
   * persists a body with zero footnote-definition blocks.
   */
  const resolveBodyToPersist = useCallback((): EditorBody => {
    if (flushEditor === undefined) {
      return body
    }
    const flushed = flushEditor()
    return flushed ?? body
  }, [body, flushEditor])

  const persistCreate = useCallback(async () => {
    if (isEditing || isCreating) {
      return
    }
    setIsCreating(true)
    setStatus({ kind: 'saving' })

    const publishedAt = localInputValueToIso(meta.publishedAt)
    const bodyToPersist = resolveBodyToPersist()
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
        body: bodyToPersist,
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

    createDraft.migrateToEditKey(savedEntity.id, draftResult.revision.clientRevisionToken, bodyToPersist)
    markBodySaved(draftResult.revision.body)

    setStatus({ kind: 'saved', at: new Date() })
    setIsCreating(false)
    void navigate(editPath(savedEntity.id), { replace: true })
  }, [
    isEditing,
    isCreating,
    meta,
    resolveBodyToPersist,
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
    const bodyToPersist = resolveBodyToPersist()
    const bodyDiverged = !areInklingDocumentsEquivalent(bodyToPersist, lastSavedBody)
    pendingActionRef.current = { kind: 'draft', remaining: bodyDiverged ? 2 : 1 }
    upsertMetaMutation.mutate(buildUpsertMetaPayload({ meta, id: detail.entity.id, publishedAt }))
    if (bodyDiverged) {
      saveDraftMutation.mutate({
        id: detail.entity.id,
        body: bodyToPersist,
        expectedClientRevisionToken: expectedToken,
      })
    }
  }, [
    isEditing,
    detail,
    meta,
    resolveBodyToPersist,
    expectedToken,
    serverPublishedAtIso,
    upsertMetaMutation,
    saveDraftMutation,
    buildUpsertMetaPayload,
    setStatus,
    pendingActionRef,
    lastSavedBody,
  ])

  const persistPublish = useCallback(() => {
    if (!isEditing || !detail) {
      setStatus({ kind: 'error', message: '请先保存基本信息再发布。' })
      return
    }
    setStatus({ kind: 'saving' })
    const publishedAtIso = localInputValueToIso(meta.publishedAt)
    const bodyToPersist = resolveBodyToPersist()
    pendingActionRef.current = { kind: 'published', remaining: 1 }
    publishMutation.mutate({
      id: detail.entity.id,
      body: bodyToPersist,
      expectedClientRevisionToken: expectedToken,
      ...(publishedAtIso !== null ? { publishedAt: publishedAtIso } : {}),
    })
    setServerPublishedAtIso(publishedAtIso ?? new Date().toISOString())
  }, [
    isEditing,
    detail,
    resolveBodyToPersist,
    expectedToken,
    meta.publishedAt,
    publishMutation,
    setStatus,
    setServerPublishedAtIso,
    pendingActionRef,
  ])

  const persistUnpublish = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    unpublishMutation.mutate({ id: detail.entity.id })
  }, [isEditing, detail, unpublishMutation, setStatus])

  // --- Mutation pending flags ----------------------------------------------
  const isSubmittingAny =
    upsertMetaMutation.isPending ||
    saveDraftMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending
  const isPending = isSubmittingAny || isCreating
  const isSavingDraft = upsertMetaMutation.isPending || saveDraftMutation.isPending
  const isPublishing = publishMutation.isPending
  const isUnpublishing = unpublishMutation.isPending

  return {
    upsertMetaMutation,
    saveDraftMutation,
    publishMutation,
    unpublishMutation,
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
