import type { NavigateFunction } from 'react-router'

import type { PortableTextBody } from '@/shared/pt/schema'

// --- Status / projection types (shared by Post + Page editor shells) -------

export type EditorShellStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; expectedToken: string }
  // Neutral message — not an error, but not a "saved" either.
  // Used by flows like "loaded a history revision" that need to
  // tell the user "you have unsaved local changes" without
  // colouring the chip red.
  | { kind: 'info'; message: string }

export type PublishState =
  // No revision has been promoted yet. Saving still works; the entity
  // is invisible to the public until a manual 发布.
  | { kind: 'not-published-yet' }
  // Latest revision was promoted AND `meta.published === true` —
  // entity is live with the current body.
  | { kind: 'published-current'; revisionNo: number }
  // Latest is a draft sitting on top of a (possibly missing)
  // published revision. Visible publicly iff `meta.published`.
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }
  // A revision was promoted at some point but the operator later
  // hit 取消发布. The body still exists in `content`; flipping
  // `meta.published` back to true re-shows the entity.
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

// --- Minimal shapes the hook reads off the per-entity DTOs -----------------

/**
 * The fields the hook reads off `AdminRevisionDto`. Both `AdminPost…` and
 * `AdminPage…` versions of the type are structurally identical (compare
 * `src/shared/types/{posts,pages}.ts`), so the hook just declares the
 * subset it needs and accepts both via structural typing.
 */
export interface RevisionLike {
  id: string
  revisionNo: number
  status: 'draft' | 'published'
  body: PortableTextBody
  clientRevisionToken: string
  updatedAt: string
}

/**
 * The fields the hook reads off the entity DTO (`AdminPostDto` /
 * `AdminPageDto`). Both share these — entity-specific fields
 * (`category`, `tags`, `pinnedAt`, `alias` on posts; `showFriends`
 * on pages) live in `TMeta` and the Shell's mutation payload builders.
 */
export interface EntityLike {
  id: string
  slug: string
  updatedAt: string
  publishedAt: string | null
}

export type SaveBodyOutput =
  | { status: 'saved'; revision: RevisionLike }
  | { status: 'conflict'; expectedToken: string; latest: RevisionLike }

// --- Hook arguments ---------------------------------------------------------

export interface UseEditorShellStateArgs<TMeta, TEntity extends EntityLike> {
  mode: 'create' | 'edit'
  /** `'post' | 'page'` — drives body-key prefixes and route stubs. */
  entityKind: 'post' | 'page'

  /** Pre-loaded detail (edit-mode only). */
  detail?: {
    entity: TEntity
    latestRevision: RevisionLike | null
    publishedRevision: RevisionLike | null
  }

  // Meta drafting
  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean

  // Local-storage draft hook factories — Shell passes the
  // per-entity hook functions (`usePostLocalDraft` /
  // `usePageLocalDraft` etc); the state hook calls them inside its
  // own body so the LS payload sees the live body/meta state we own
  // here, without forcing the Shell to forward-declare them.
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

  // Mutation function bindings — Shell wraps the entity-specific
  // oRPC endpoints and normalises the response to `{ entity }` /
  // `SaveBodyOutput`. The hook owns the `useMutation()` calls + the
  // onSuccess/onError handlers internally so it can wire them into
  // its status machine without TDZ gymnastics.
  upsertMetaFn: (input: Record<string, unknown>) => Promise<TEntity>
  saveDraftFn: (input: Record<string, unknown>) => Promise<SaveBodyOutput>
  publishFn: (input: Record<string, unknown>) => Promise<SaveBodyOutput>
  unpublishFn: (input: { id: string }) => Promise<TEntity>

  /**
   * Build the upsertMeta payload from the meta draft. Post passes
   * `pinnedAt`, `category`, `tags`, `alias`; page passes `showFriends`.
   * Common fields (`title`, `summary`, `cover`, `og`, `published`,
   * `commentsEnabled`, `showToc`, `showUpdated`, `slug`, `publishedAt`)
   * are built here from `meta`.
   */
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt: string | null }) => Record<string, unknown>

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

// --- Hook output ------------------------------------------------------------

export interface UseEditorShellStateOutput<TMeta> {
  // Body + meta drafts
  meta: TMeta
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody

  // Convenience: `mode === 'edit' && detail !== undefined`
  isEditing: boolean

  // Status chip
  status: EditorShellStatus
  sidebarSaveStatus: SidebarSaveStatus

  // Visibility toggles
  previewOpen: boolean
  setPreviewOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean

  // Refs for scroll sync — Shell hands them to PreviewPanel /
  // PageBodyEditor.
  editorScrollRef: React.RefObject<HTMLDivElement | null>
  previewScrollRef: React.RefObject<HTMLDivElement | null>

  // Conflict dialog state
  conflict: { localBody: PortableTextBody; localSavedAt: number } | null

  // Banner
  previewBanner: { kind: 'draft' | 'published'; slug: string } | null
  dismissPreviewBanner: () => void

  // Create-mode LS draft savedAt timestamp (for the create-mode
  // banner). The Shell doesn't see the hook's internal createDraft
  // result directly; we surface this single field instead.
  createDraftSavedAt: number | null

  // Mutation pending flags
  isPending: boolean
  isSavingDraft: boolean
  isPublishing: boolean
  isUnpublishing: boolean
  isCreating: boolean

  // Derived flags
  canPersistMeta: boolean
  canPublish: boolean
  publishState: PublishState
  sidebarPublishStatus: SidebarPublishStatus | null
  sidebarRevisionSummary: SidebarRevisionSummary | null
  showPreviewPublicSyncHint: boolean
  expectedToken: string | null

  // Save handlers (bound to the Shell-provided mutations)
  persistCreate: () => Promise<void>
  persistSave: () => void
  persistPublish: () => void
  persistUnpublish: () => void

  // Conflict / history adoption handlers
  adoptLocalDraft: () => Promise<void>
  adoptServerVersion: () => void
  adoptRevisionFromHistory: (revision: { body: PortableTextBody; revisionNo: number }) => void

  // Reducers exposed so the Shell can wire mutation onSuccess to the
  // hook's status machine. These are stable identities (memoised
  // inside the hook).
  onMetaSaved: (entity: EntityLike) => void
  onBodySaved: (payload: SaveBodyOutput) => void
  onUnpublishSaved: (entity: EntityLike, freshMeta: TMeta) => void
  noteError: (message: string) => void
}
