import type { SaveBodyOutput } from '@kobato/api/contracts/admin/revision'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { useMutation } from '@tanstack/react-query'
import { type Dispatch, type SetStateAction, type RefObject, useCallback } from 'react'

import type { EditorShellStatus, EntityLike, UseEditorShellStateArgs } from '@/ui/editor-shell/editor-shell-types'
export interface UseEditorShellPersistMutationsArgs<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  upsertMetaFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['upsertMetaFn']
  saveDraftFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['saveDraftFn']
  publishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['publishFn']
  unpublishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['unpublishFn']
  metaDraftFromEntity: (entity: TEntity) => TMeta
  applyServerMeta: (meta: TMeta) => void
  markMetaPublished: () => void
  setStatus: Dispatch<SetStateAction<EditorShellStatus>>
  setDisplaySaveAtMs: Dispatch<SetStateAction<number | null>>
  setServerPublishedAtIso: Dispatch<SetStateAction<string | null>>
  noteActionLegSucceeded: (slug: string) => void
  cancelActionBanner: () => void
  dismissPreviewBanner: () => void
  manualSaveBodyRef: RefObject<LexicalEditorState | null>
  publishedAtBeforePublishRef: RefObject<string | null>
  handleBodySavedRef: RefObject<(payload: SaveBodyOutput) => void>
}

export function useEditorShellPersistMutations<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellPersistMutationsArgs<TMeta, TEntity, TUpsertMetaInput>) {
  const {
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
  } = args

  const noteError = useCallback(
    (message: string) => {
      manualSaveBodyRef.current = null
      setStatus({ kind: 'error', message })
      cancelActionBanner()
    },
    [cancelActionBanner, manualSaveBodyRef, setStatus],
  )

  const noteMetaSaved = useCallback(
    (saved: TEntity) => {
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
    [
      applyServerMeta,
      metaDraftFromEntity,
      noteActionLegSucceeded,
      setStatus,
      setServerPublishedAtIso,
      setDisplaySaveAtMs,
    ],
  )

  const noteUnpublishSaved = useCallback(
    (saved: TEntity) => {
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
    [
      applyServerMeta,
      metaDraftFromEntity,
      dismissPreviewBanner,
      setStatus,
      setServerPublishedAtIso,
      setDisplaySaveAtMs,
    ],
  )

  const upsertMetaMutation = useMutation({
    mutationFn: upsertMetaFn,
    onSuccess: (saved) => noteMetaSaved(saved),
    onError: (error) => noteError(error.message),
  })
  const saveDraftMutation = useMutation({
    mutationFn: saveDraftFn,
    onSuccess: (payload) => handleBodySavedRef.current(payload),
    onError: (error) => noteError(error.message),
  })
  const publishMutation = useMutation({
    mutationFn: publishFn,
    onSuccess: (payload) => {
      handleBodySavedRef.current(payload)
      if (payload.status === 'saved') {
        markMetaPublished()
      }
    },
    onError: (error) => {
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

  return { upsertMetaMutation, saveDraftMutation, publishMutation, unpublishMutation, isSubmittingAny }
}
