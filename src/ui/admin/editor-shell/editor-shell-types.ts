import type { NavigateFunction } from 'react-router'

import type { PortableTextBody } from '@/shared/pt/schema'

export type EditorShellStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; expectedToken: string }
  | { kind: 'info'; message: string }

export type PublishState =
  | { kind: 'not-published-yet' }
  | { kind: 'published-current'; revisionNo: number }
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }
  | { kind: 'unpublished'; lastPublishedRevisionNo: number | null }

export type SidebarPublishStatus = 'never-saved' | 'offline' | 'scheduled' | 'live' | 'live-with-draft-ahead'

export type SidebarRevisionSummary =
  | { kind: 'no-revision' }
  | { kind: 'published-current'; revisionNo: number }
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }

export type SidebarSaveStatus =
  | { kind: 'saving' }
  | { kind: 'saved'; atMs: number }
  | { kind: 'unsaved' }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }

export interface RevisionLike {
  id: string
  revisionNo: number
  status: 'draft' | 'published'
  body: PortableTextBody
  clientRevisionToken: string
  updatedAt: string
}

export interface EntityLike {
  id: string
  slug: string
  updatedAt: string
  publishedAt: string | null
}

export interface EditorShellDetail<TEntity extends EntityLike> {
  entity: TEntity
  latestRevision: RevisionLike | null
  publishedRevision: RevisionLike | null
}

export type EditorShellArgs<TEntity extends EntityLike> =
  | { isEditing: true; detail: EditorShellDetail<TEntity> }
  | { isEditing: false; detail?: undefined }

export interface SaveBodyInput {
  id: string
  body: PortableTextBody
  expectedClientRevisionToken?: string | null
  force?: boolean
  publishedAt?: string
}

export type SaveBodyOutput =
  | { status: 'saved'; revision: RevisionLike }
  | { status: 'conflict'; expectedToken: string; latest: RevisionLike }

export interface UseEditorShellStateArgs<
  TMeta,
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  mode: 'create' | 'edit'
  /** `'post' | 'page'` — drives body-key prefixes and route stubs. */
  entityKind: 'post' | 'page'

  /** Pre-loaded detail (edit-mode only). */
  detail?: {
    entity: TEntity
    latestRevision: RevisionLike | null
    publishedRevision: RevisionLike | null
  }

  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean
  useLocalDraftHook: (input: {
    entityId: string | null
    clientRevisionToken: string | null
    body: PortableTextBody
    disabled: boolean
  }) => { loadedDraft: { body: PortableTextBody; savedAt: number } | null; clearDraft: () => void }
  useCreateDraftHook: (input: { body: PortableTextBody; meta: TMeta }) => {
    loadedDraft: { meta: TMeta; body: PortableTextBody; savedAt: number } | null
    migrateToEditKey: (id: string, token: string, body: PortableTextBody) => void
  }

  upsertMetaFn: (input: TUpsertMetaInput) => Promise<TEntity>
  saveDraftFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublishFn: (input: { id: string }) => Promise<TEntity>

  /**
   * Build the upsertMeta payload from the meta draft. Post passes
   * `pinnedAt`, `category`, `tags`, `alias`; page passes `showFriends`.
   * Common fields (`title`, `summary`, `cover`, `og`, `published`,
   * `commentsEnabled`, `showToc`, `showUpdated`, `slug`, `publishedAt`)
   * are built here from `meta`.
   */
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt: string | null }) => TUpsertMetaInput

  /**
   * Direct oRPC `saveDraft` for autosave + force-save (adoptLocalDraft).
   * `useMutation.mutate()` doesn't return a promise so we need a raw
   * caller for the await-driven flows.
   */
  directSaveDraft: (input: {
    id: string
    body: PortableTextBody
    expectedClientRevisionToken?: string | null
    force?: boolean
  }) => Promise<SaveBodyOutput>

  // Routing
  editPath: (id: string) => string
  navigate: NavigateFunction
}

export interface UseEditorShellStateOutput<TMeta> {
  meta: TMeta
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  isEditing: boolean
  status: EditorShellStatus
  sidebarSaveStatus: SidebarSaveStatus
  previewOpen: boolean
  setPreviewOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean
  editorScrollRef: React.RefObject<HTMLDivElement | null>
  previewScrollRef: React.RefObject<HTMLDivElement | null>
  conflict: { localBody: PortableTextBody; localSavedAt: number } | null
  previewBanner: { kind: 'draft' | 'published'; slug: string } | null
  dismissPreviewBanner: () => void
  createDraftSavedAt: number | null
  isPending: boolean
  isSavingDraft: boolean
  isPublishing: boolean
  isUnpublishing: boolean
  isCreating: boolean
  canPersistMeta: boolean
  canPublish: boolean
  publishState: PublishState
  sidebarPublishStatus: SidebarPublishStatus | null
  sidebarRevisionSummary: SidebarRevisionSummary | null
  showPreviewPublicSyncHint: boolean
  expectedToken: string | null
  persistCreate: () => Promise<void>
  persistSave: () => void
  persistPublish: () => void
  persistUnpublish: () => void
  adoptLocalDraft: () => Promise<void>
  adoptServerVersion: () => void
  adoptRevisionFromHistory: (revision: { body: PortableTextBody; revisionNo: number }) => void
  onMetaSaved: (entity: EntityLike) => void
  onBodySaved: (payload: SaveBodyOutput) => void
  onUnpublishSaved: (entity: EntityLike, freshMeta: TMeta) => void
  noteError: (message: string) => void
}
