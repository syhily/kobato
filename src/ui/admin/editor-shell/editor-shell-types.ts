import type { NavigateFunction } from 'react-router'

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { SaveBodyInput, SaveBodyOutput } from '@/shared/contracts/revision'
import type { PortableTextBody } from '@/shared/pt/schema'

export type EditorShellStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'warning'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; expectedToken: string }
  | { kind: 'info'; message: string }

/** One merged autosave gate, two sources: `local` (dialog adopt/discard) and `server` (next clean save). */
export type ConflictFreezeSource = 'local' | 'server'

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
  | { kind: 'warning'; message: string }
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

/**
 * R11 interregnum: the wire `SaveBodyInput` carries a Lexical state since R9a,
 * but the shell still speaks PortableText end-to-end until the editor swap.
 * The adapter casts this PT-shaped input back to `SaveBodyInput` at the wire
 * boundary; remove together with the rest of the PT shell in R11.
 */
export type ShellSaveBodyInput = Omit<SaveBodyInput, 'body'> & { body: PortableTextBody }

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

export interface UseEditorShellStateArgs<
  TMeta,
  TEntity extends EntityLike,
  TUpsertMetaInput = Record<string, unknown>,
> {
  mode: 'create' | 'edit'

  /** Pre-loaded detail (edit-mode only). */
  detail?: EditorShellDetail<TEntity>

  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean
  localDraftConfig: LocalDraftConfig<PortableTextBody>
  createDraftConfig: CreateDraftConfig<PortableTextBody>

  upsertMetaFn: (input: TUpsertMetaInput) => Promise<TEntity>
  saveDraftFn: (input: ShellSaveBodyInput) => Promise<SaveBodyOutput>
  publishFn: (input: ShellSaveBodyInput) => Promise<SaveBodyOutput>
  unpublishFn: (input: { id: string }) => Promise<TEntity>

  /** Build the upsertMeta payload from the meta draft — common fields are
   *  built here; entity-specific fields come from the caller. */
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt?: string | null }) => TUpsertMetaInput

  /** Direct oRPC `saveDraft` for autosave + force-save — `mutate()` returns no promise, so await-driven flows need a raw caller. */
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

/** Narrow slice consumed by the toolbar row (and the floating publish button). */
export interface EditorToolbarState {
  previewOpen: boolean
  setPreviewOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** `meta.published` — drives the unpublish button. */
  published: boolean
  isPending: boolean
  isSavingDraft: boolean
  isPublishing: boolean
  isUnpublishing: boolean
  isCreating: boolean
  canPersistMeta: boolean
  canPublish: boolean
  publishStatus: SidebarPublishStatus | null
  persistCreate: () => Promise<void>
  persistSave: () => void
  persistPublish: () => void
  persistUnpublish: () => void
}

/** Narrow slice consumed by the meta panel (aside / Sheet). */
export interface EditorSidebarState<TMeta> {
  draft: TMeta
  onChange: React.Dispatch<React.SetStateAction<TMeta>>
  disabled: boolean
  publishStatus: SidebarPublishStatus | null
  revisionSummary: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  expectedToken: string | null
  body: PortableTextBody
  adoptRevisionFromHistory: (revision: { body: PortableTextBody; revisionNo: number }) => void
}

/** Narrow slice consumed by the draft-conflict dialog. */
export interface EditorDialogState {
  conflict: { localBody: PortableTextBody; localSavedAt: number } | null
  /** Baseline body the server holds — the dialog's "server version". */
  serverBody: PortableTextBody
  baselineUpdatedAtMs: number | null
  adoptLocalDraft: () => Promise<void>
  adoptServerVersion: () => void
}

/** Orchestrator output: the top level carries only what the screen body
 *  renders; subsection consumers receive the narrow views above. */
export interface UseEditorShellStateOutput<TMeta> {
  meta: TMeta
  setMeta: React.Dispatch<React.SetStateAction<TMeta>>
  body: PortableTextBody
  setBody: React.Dispatch<React.SetStateAction<PortableTextBody>>
  bodyKey: string
  initialBody: PortableTextBody
  isEditing: boolean
  previewOpen: boolean
  setPreviewOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
  metaOpen: boolean
  setMetaOpen: React.Dispatch<React.SetStateAction<boolean>>
  isLg: boolean
  editorScrollRef: React.RefObject<HTMLDivElement | null>
  previewScrollRef: React.RefObject<HTMLDivElement | null>
  previewBanner: { kind: 'draft' | 'published'; slug: string } | null
  dismissPreviewBanner: () => void
  createDraftSavedAt: number | null
  toolbar: EditorToolbarState
  sidebar: EditorSidebarState<TMeta>
  dialog: EditorDialogState
}
