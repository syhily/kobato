import type { NavigateFunction } from 'react-router'

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { InklingDocument } from '@/shared/inkling/schema'

/**
 * Body type for the editor shell. Plan 008 proves the shell can operate on
 * Lexical JSON only; PortableText is intentionally not part of this alias.
 */
export type EditorBody = InklingDocument

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
  body: EditorBody
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
  body: EditorBody
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
  localDraftConfig: LocalDraftConfig<EditorBody>
  createDraftConfig: CreateDraftConfig<EditorBody>

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
    body: EditorBody
    expectedClientRevisionToken?: string | null
    force?: boolean
  }) => Promise<SaveBodyOutput>

  // Routing
  editPath: (id: string) => string
  navigate: NavigateFunction

  /**
   * Synchronously flush the editor's pending (debounced) edits and return the
   * freshest document. Called by every persist handler before it reads the
   * body to persist — closes the window where a save/publish inside the
   * change-plugin's 120ms debounce silently dropped the last edits. Set by
   * the owning shell from the article editor's flush handle.
   */
  flushEditor?: () => InklingDocument | null
}

export interface UseEditorShellStateOutput<TMeta, TEntity extends EntityLike = EntityLike> {
  meta: TMeta
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  body: EditorBody
  setBody: React.Dispatch<React.SetStateAction<EditorBody>>
  bodyKey: string
  initialBody: EditorBody
  isEditing: boolean
  status: EditorShellStatus
  sidebarSaveStatus: SidebarSaveStatus
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean
  editorScrollRef: React.RefObject<HTMLDivElement | null>
  conflict: { localBody: EditorBody; localSavedAt: number } | null
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
  adoptRevisionFromHistory: (revision: { body: EditorBody; revisionNo: number }) => void
  onMetaSaved: (entity: TEntity) => void
  onBodySaved: (payload: SaveBodyOutput) => void
  onUnpublishSaved: (entity: TEntity, freshMeta: TMeta) => void
  noteError: (message: string) => void
}
