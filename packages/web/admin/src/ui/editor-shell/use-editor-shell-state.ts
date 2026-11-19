import type { LexicalEditorState } from '@kobato/inkling/headless/schema.ts'
import type {
  EntityLike,
  PublishState,
  SidebarPublishStatus,
  UseEditorShellStateArgs,
  UseEditorShellStateOutput,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'

import { EMPTY_LEXICAL_EDITOR_STATE } from '@kobato/inkling/headless/schema.ts'
import { useCreateDraft } from '@kobato/web-admin/ui/editor-shell/drafts/use-create-draft.ts'
import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-derived.ts'
import { useEditorKeyboardShortcuts } from '@kobato/web-admin/ui/editor-shell/use-editor-keyboard-shortcuts.ts'
import { useEditorShellLayout } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-layout.ts'
import { useEditorShellPersist } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist.ts'
import { useCallback, useMemo, useState } from 'react'

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

  const [restoredCreateBody, setRestoredCreateBody] = useState<LexicalEditorState | null>(null)

  const initialBody = useMemo<LexicalEditorState>(() => {
    return deriveBaselineRevision(detail)?.body ?? restoredCreateBody ?? EMPTY_LEXICAL_EDITOR_STATE
  }, [detail, restoredCreateBody])

  const [body, setBody] = useState<LexicalEditorState>(initialBody)

  const initialBodyKey = useMemo(() => {
    if (detail === undefined) {
      return 'create:initial'
    }
    const rev = deriveBaselineRevision(detail)
    return rev !== null ? `${detail.entity.id}:${rev.clientRevisionToken}` : `${detail.entity.id}:empty`
  }, [detail])

  const [bodyKey, setBodyKey] = useState(initialBodyKey)

  const replaceBody = useCallback((newBody: LexicalEditorState, key: string) => {
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

  const { metaOpen, setMetaOpen, isLg } = useEditorShellLayout()

  const createDraft = useCreateDraft(createDraftConfig, { body, meta })

  const [createDraftHydrated, setCreateDraftHydrated] = useState(false)
  if (!isEditing && !createDraftHydrated && createDraft.loadedDraft !== null) {
    setCreateDraftHydrated(true)
    setMeta(createDraft.loadedDraft.meta)
    setRestoredCreateBody(createDraft.loadedDraft.body)
    replaceBody(createDraft.loadedDraft.body, `create:restored:${createDraft.loadedDraft.savedAt}`)
  }

  const markMetaPublished = useCallback(() => {
    setMeta((m) => ({ ...m, published: true }))
  }, [])

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

    metaOpen,
    setMetaOpen,
    isLg,

    previewBanner,
    dismissPreviewBanner,
    createDraftSavedAt: createDraft.loadedDraft?.savedAt ?? null,

    toolbar: {
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
