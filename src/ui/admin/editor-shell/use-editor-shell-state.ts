import { useCallback, useMemo, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  EntityLike,
  PublishState,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { useCreateDraft } from '@/client/hooks/use-create-draft'
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

  const { previewOpen, setPreviewOpen, metaOpen, setMetaOpen, isLg, editorScrollRef, previewScrollRef } =
    useEditorShellLayout()

  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

  // Render-phase state adjustment (react-compiler-safe pattern): hydrate once
  // when the create draft resolves. The load is async (IndexedDB in
  // useEffect), so only latch when a stored draft actually arrived — latching
  // on the first null render would skip the restore while the banner still
  // claims 已恢复本地草稿.
  const [createDraftHydrated, setCreateDraftHydrated] = useState(false)
  if (!isEditing && !createDraftHydrated && createDraft.loadedDraft !== null) {
    setCreateDraftHydrated(true)
    setMeta(createDraft.loadedDraft.meta)
    setRestoredCreateBody(createDraft.loadedDraft.body)
    replaceBody(createDraft.loadedDraft.body, `create:restored:${createDraft.loadedDraft.savedAt}`)
  }

  // Persist reports back through these notifications only; the meta draft
  // stays here because the create-mode hydration above also writes it.
  const markMetaPublished = useCallback(() => {
    setMeta((m) => ({ ...m, published: true }))
  }, [])

  // Persist owns the revision race (expected token + latest/published), both
  // autosave freeze legs, the local-draft conflict, and the persisted
  // baseline — everything below is read-only projection of its output.
  const {
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
  } = useEditorShellPersist({
    detail,
    draft: {
      meta,
      body,
      initialBody,
    },
    localDraftConfig,
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
      replaceBody,
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

  const canPersistMeta = meta.title.trim() !== ''
  const canPublish = isEditing && publishState.kind !== 'published-current'
  const sidebarRevisionSummary = deriveSidebarRevisionSummary({ isEditing, publishState })
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
