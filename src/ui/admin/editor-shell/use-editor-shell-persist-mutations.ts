// The mutation slice of the persist module: the four wire mutations
// (upsertMeta / saveDraft / publish / unpublish — the declaration order is a
// test-pinned contract) plus their note* interpreters. Save-result
// classification is NOT re-done here: body payloads route back to the
// orchestrator's `noteBodySaved` through `handleBodySavedRef` (the ref
// mirror that breaks the declaration cycle with the autosave engine).

import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { SaveBodyOutput } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { EditorShellStatus, EntityLike, UseEditorShellStateArgs } from '@/ui/admin/editor-shell/editor-shell-types'

export interface UseEditorShellPersistMutationsArgs<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  upsertMetaFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['upsertMetaFn']
  saveDraftFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['saveDraftFn']
  publishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['publishFn']
  unpublishFn: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>['unpublishFn']
  /** Entity → meta-draft projection (the server-confirmed meta adoption). */
  metaDraftFromEntity: (entity: TEntity) => TMeta
  /** Adopt the server-confirmed meta draft after a meta save / unpublish. */
  applyServerMeta: (meta: TMeta) => void
  /** Flip the local meta draft's `published` flag after a successful publish. */
  markMetaPublished: () => void
  setStatus: React.Dispatch<React.SetStateAction<EditorShellStatus>>
  setDisplaySaveAtMs: React.Dispatch<React.SetStateAction<number | null>>
  setServerPublishedAtIso: React.Dispatch<React.SetStateAction<string | null>>
  noteActionLegSucceeded: (slug: string) => void
  cancelActionBanner: () => void
  dismissPreviewBanner: () => void
  /** Body snapshot of the in-flight manual save — cleared on any error. */
  manualSaveBodyRef: React.RefObject<LexicalEditorState | null>
  /** Pre-publish server publishedAt, restored when the publish leg fails. */
  publishedAtBeforePublishRef: React.RefObject<string | null>
  /** The orchestrator's body-save interpreter, mirrored through a ref. */
  handleBodySavedRef: React.RefObject<(payload: SaveBodyOutput) => void>
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

  return { upsertMetaMutation, saveDraftMutation, publishMutation, unpublishMutation, isSubmittingAny }
}
