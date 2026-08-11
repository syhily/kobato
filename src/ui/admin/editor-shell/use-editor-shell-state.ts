import { useCallback, useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  ConflictFreezeSource,
  EntityLike,
  PublishState,
  RevisionLike,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { useLocalDraft } from '@/client/hooks/use-local-draft'
import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-derived'
import { useEditorKeyboardShortcuts } from '@/ui/admin/editor-shell/use-editor-keyboard-shortcuts'
import { useEditorShellLayout } from '@/ui/admin/editor-shell/use-editor-shell-layout'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

// Single shared reference — a fresh `[]` triggers infinite setState-during-render.
const EMPTY_BODY: PortableTextBody = []

export function useEditorShellState<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
>(args: UseEditorShellStateArgs<TMeta, TEntity, TUpsertMetaInput>): UseEditorShellStateOutput<TMeta> {
  const {
    mode,
    detail,
    emptyMeta,
    metaDraftFromEntity,
    metaDraftsEqual,
    localDraftConfig,
    createDraftConfig,
    upsertMetaFn,
    saveDraftFn,
    publishFn,
    unpublishFn,
    buildUpsertMetaPayload,
    directSaveDraft,
    editPath,
    navigate,
  } = args

  const isEditing = mode === 'edit' && detail !== undefined

  // Create mode has no `detail` — once the async IndexedDB load resolves,
  // the restored draft body is what PageBodyEditor must mount with instead.
  const [restoredCreateBody, setRestoredCreateBody] = useState<PortableTextBody | null>(null)

  // `detail` is the loader-stable reference the screen memoizes.
  const initialBody = useMemo<PortableTextBody>(() => {
    return deriveBaselineRevision(detail)?.body ?? restoredCreateBody ?? EMPTY_BODY
  }, [detail, restoredCreateBody])

  const [body, setBody] = useState<PortableTextBody>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (detail === undefined) {
      return 'create:initial'
    }
    const rev = deriveBaselineRevision(detail)
    return rev !== null ? `${detail.entity.id}:${rev.clientRevisionToken}` : `${detail.entity.id}:empty`
  }, [detail])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)

  const replaceBody = useCallback((newBody: PortableTextBody, key: string) => {
    setBody(newBody)
    setBodyKey(key)
  }, [])

  const [meta, setMeta] = useState<TMeta>(detail !== undefined ? metaDraftFromEntity(detail.entity) : emptyMeta)
  const [lastPersistedMeta, setLastPersistedMeta] = useState<TMeta>(
    detail !== undefined ? metaDraftFromEntity(detail.entity) : { ...emptyMeta },
  )

  const resetMeta = useCallback((freshMeta: TMeta) => {
    setMeta(freshMeta)
    setLastPersistedMeta(freshMeta)
  }, [])

  const [expectedToken, setExpectedToken] = useState<string | null>(
    deriveBaselineRevision(detail)?.clientRevisionToken ?? null,
  )
  const [latestRevision, setLatestRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.latestRevision : null,
  )
  const [publishedRevision, setPublishedRevision] = useState<RevisionLike | null>(
    detail !== undefined ? detail.publishedRevision : null,
  )
  // The `server` leg of the autosave freeze — set via `noteRevisionConflict`,
  // cleared by the next clean body save below.
  const [serverConflicted, setServerConflicted] = useState(false)

  const updateAfterSave = useCallback((revision: RevisionLike) => {
    // A clean body save also clears the `server` freeze leg (the `local` leg clears via the dialog's adopt handlers).
    setServerConflicted(false)
    setExpectedToken(revision.clientRevisionToken)
    setLatestRevision(revision)
    if (revision.status === 'published') {
      setPublishedRevision(revision)
    }
  }, [])

  const { previewOpen, setPreviewOpen, metaOpen, setMetaOpen, isLg, editorScrollRef, previewScrollRef } =
    useEditorShellLayout()

  const { loadedDraft: loadedLocalDraft, clearDraft: clearLocalDraft } = useLocalDraft(localDraftConfig, {
    entityId: isEditing ? detail.entity.id : null,
    clientRevisionToken: expectedToken,
    body,
    disabled: !isEditing,
  })
  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

  // Render-phase state adjustment (react-compiler-safe pattern, same as the
  // conflict check below): hydrate once when the create draft resolves. The
  // load is async (IndexedDB in useEffect), so only latch when a stored
  // draft actually arrived — latching on the first null render would skip
  // the restore while the banner still claims 已恢复本地草稿.
  const [createDraftHydrated, setCreateDraftHydrated] = useState(false)
  if (!isEditing && !createDraftHydrated && createDraft.loadedDraft !== null) {
    setCreateDraftHydrated(true)
    setMeta(createDraft.loadedDraft.meta)
    setRestoredCreateBody(createDraft.loadedDraft.body)
    replaceBody(createDraft.loadedDraft.body, `create:restored:${createDraft.loadedDraft.savedAt}`)
  }

  const [conflict, setConflict] = useState<{
    localBody: PortableTextBody
    localSavedAt: number
  } | null>(null)
  const [conflictResolved, setConflictResolved] = useState(false)
  const [lastConflictCheck, setLastConflictCheck] = useState({
    loadedLocalDraft,
    initialBody,
    conflictResolved,
  })
  if (
    lastConflictCheck.loadedLocalDraft !== loadedLocalDraft ||
    lastConflictCheck.initialBody !== initialBody ||
    lastConflictCheck.conflictResolved !== conflictResolved
  ) {
    setLastConflictCheck({ loadedLocalDraft, initialBody, conflictResolved })
    if (
      !conflictResolved &&
      loadedLocalDraft !== null &&
      !arePortableTextBodiesEquivalent(loadedLocalDraft.body, initialBody)
    ) {
      setConflict({ localBody: loadedLocalDraft.body, localSavedAt: loadedLocalDraft.savedAt })
    }
  }

  // Persist reports back through these notifications only. The expected
  // token and both freeze legs stay here — moving them into persist would
  // close a hook-ordering cycle.
  const markMetaPublished = useCallback(() => {
    setMeta((m) => ({ ...m, published: true }))
  }, [])

  const noteRevisionConflict = useCallback(() => {
    setServerConflicted(true)
  }, [])

  // The merged autosave freeze: one gate, two sources; the local leg wins
  // the `source` label when both are set.
  const conflictFreeze: ConflictFreezeSource | null = conflict !== null ? 'local' : serverConflicted ? 'server' : null

  const {
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
  } = useEditorShellPersist({
    detail,
    draft: {
      meta,
      body,
      expectedToken,
      freeze: conflictFreeze,
    },
    mutations: {
      upsertMetaFn,
      saveDraftFn,
      publishFn,
      unpublishFn,
      buildUpsertMetaPayload,
      directSaveDraft,
    },
    metaDraftFromEntity,
    notifications: {
      applyServerMeta: resetMeta,
      markMetaPublished,
      noteRevisionSaved: updateAfterSave,
      noteRevisionConflict,
    },
    routing: { editPath, navigate },
    createDraft,
  })

  // Baseline timestamp — single-owner projection from editor-shell-derived.
  const baselineUpdatedAtMs = useMemo(() => (isEditing ? deriveBaselineUpdatedAtMs(detail) : null), [isEditing, detail])

  const publishState = useMemo<PublishState>(
    () =>
      isEditing ? derivePublishState(latestRevision, publishedRevision, meta.published) : { kind: 'not-published-yet' },
    [isEditing, latestRevision, publishedRevision, meta.published],
  )

  const sidebarPublishStatus = useMemo<SidebarPublishStatus | null>(
    () => deriveSidebarPublishStatus({ isEditing, publishState, publishedAt: meta.publishedAt }),
    [isEditing, publishState, meta.publishedAt],
  )

  useEditorKeyboardShortcuts({
    mode,
    isEditing,
    isPending,
    persistCreate,
    persistSave,
    persistPublish,
    publishState,
  })

  const adoptLocalDraft = useCallback(async () => {
    if (conflict === null || !isEditing || !detail) {
      return
    }
    replaceBody(conflict.localBody, `${detail.entity.id}:adopt-local:${Date.now()}`)
    setConflict(null)
    setConflictResolved(true)
    setStatus({ kind: 'saving' })
    try {
      const result = await directSaveDraft({
        id: detail.entity.id,
        body: conflict.localBody,
        expectedClientRevisionToken: expectedToken,
        force: true,
      })
      noteBodySaved(result)
      if (result.status === 'saved') {
        // Advance the autosave baseline to the adopted body so the next debounce tick short-circuits.
        noteBodyPersisted(conflict.localBody)
      }
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : '保存失败' })
    }
  }, [
    conflict,
    isEditing,
    detail,
    expectedToken,
    directSaveDraft,
    noteBodySaved,
    noteBodyPersisted,
    replaceBody,
    setStatus,
  ])

  const adoptServerVersion = useCallback(() => {
    replaceBody(initialBody, `${detail?.entity.id ?? 'new'}:adopt-server:${Date.now()}`)
    markBodySaved(initialBody)
    clearLocalDraft()
    setConflict(null)
    setConflictResolved(true)
  }, [initialBody, detail, clearLocalDraft, replaceBody, markBodySaved])

  const adoptRevisionFromHistory = useCallback(
    (revision: { body: PortableTextBody; revisionNo: number }) => {
      if (!isEditing || !detail) {
        return
      }
      replaceBody(revision.body, `${detail.entity.id}:adopt-revision:${revision.revisionNo}:${Date.now()}`)
      setStatus({ kind: 'info', message: `已载入 R${revision.revisionNo}，记得保存或发布以生效。` })
    },
    [isEditing, detail, replaceBody, setStatus],
  )

  const canPersistMeta = meta.title.trim() !== ''
  const canPublish = isEditing && publishState.kind !== 'published-current'
  const sidebarRevisionSummary = deriveSidebarRevisionSummary({ isEditing, publishState })
  const isBodyDirty = !arePortableTextBodiesEquivalent(body, lastSavedBody)
  const isMetaDirty = !metaDraftsEqual(meta, lastPersistedMeta)
  const sidebarSaveStatus = deriveSidebarSaveStatus({ status, isEditing, isBodyDirty, isMetaDirty, displaySaveAtMs })

  return {
    meta,
    setMeta,
    body,
    setBody,
    bodyKey,
    initialBody,
    isEditing,

    previewOpen,
    setPreviewOpen,
    metaOpen,
    setMetaOpen,
    isLg,

    editorScrollRef,
    previewScrollRef,

    previewBanner,
    dismissPreviewBanner,
    createDraftSavedAt: createDraft.loadedDraft?.savedAt ?? null,

    toolbar: {
      previewOpen,
      setPreviewOpen,
      metaOpen,
      setMetaOpen,
      published: meta.published,
      isPending,
      isSavingDraft,
      isPublishing,
      isUnpublishing,
      isCreating,
      canPersistMeta,
      canPublish,
      publishStatus: sidebarPublishStatus,
      persistCreate,
      persistSave,
      persistPublish,
      persistUnpublish,
    },

    sidebar: {
      draft: meta,
      onChange: setMeta,
      disabled: isPending,
      publishStatus: sidebarPublishStatus,
      revisionSummary: sidebarRevisionSummary,
      saveStatus: sidebarSaveStatus,
      expectedToken,
      body,
      adoptRevisionFromHistory,
    },

    dialog: {
      conflict,
      serverBody: initialBody,
      baselineUpdatedAtMs,
      adoptLocalDraft,
      adoptServerVersion,
    },
  }
}
