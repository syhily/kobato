import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  EditorShellStatus,
  EntityLike,
  RevisionLike,
  SaveBodyOutput,
  UseEditorShellStateArgs,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useAutosave, type AutosaveStatus } from '@/client/hooks/use-autosave'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
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
  body: PortableTextBody
  expectedToken: string | null
  detail?: {
    entity: TEntity
    latestRevision: RevisionLike | null
    publishedRevision: RevisionLike | null
  }
  serverPublishedAtIso: string | null
  conflict: { localBody: PortableTextBody; localSavedAt: number } | null

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

  setStatus: React.Dispatch<React.SetStateAction<EditorShellStatus>>
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  setServerPublishedAtIso: React.Dispatch<React.SetStateAction<string | null>>

  lastSavedBodyRef: React.RefObject<PortableTextBody>
  pendingActionRef: React.RefObject<{ kind: 'draft' | 'published'; remaining: number } | null>
  createDraft: { migrateToEditKey: (id: string, token: string, body: PortableTextBody) => void }
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
    setStatus,
    setMeta,
    setServerPublishedAtIso,
    lastSavedBodyRef,
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
  handleBodySavedRef.current = onBodySaved

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
        setStatus({ kind: 'saved', at: new Date(autosaveStatus.at) })
      } else if (autosaveStatus.kind === 'retrying') {
        setStatus({ kind: 'error', message: autosaveStatus.message })
      }
    },
  })

  // --- Persist handlers ----------------------------------------------------
  const [isCreating, setIsCreating] = useState(false)

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
    lastSavedBodyRef.current = draftResult.revision.body

    setStatus({ kind: 'saved', at: new Date() })
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
    lastSavedBodyRef,
  ])

  const persistSave = useCallback(() => {
    if (!isEditing || !detail) {
      return
    }
    setStatus({ kind: 'saving' })
    const pickerIso = localInputValueToIso(meta.publishedAt)
    const serverIsScheduled = serverPublishedAtIso !== null && (Date.parse(serverPublishedAtIso) || 0) > Date.now()
    const publishedAt = pickerIso !== null ? pickerIso : serverIsScheduled ? new Date().toISOString() : null
    const bodyDiverged = !arePortableTextBodiesEquivalent(body, lastSavedBodyRef.current)
    pendingActionRef.current = { kind: 'draft', remaining: bodyDiverged ? 2 : 1 }
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
    pendingActionRef,
    lastSavedBodyRef,
  ])

  const persistPublish = useCallback(() => {
    if (!isEditing || !detail) {
      setStatus({ kind: 'error', message: '请先保存基本信息再发布。' })
      return
    }
    setStatus({ kind: 'saving' })
    const publishedAtIso = localInputValueToIso(meta.publishedAt)
    pendingActionRef.current = { kind: 'published', remaining: 1 }
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
