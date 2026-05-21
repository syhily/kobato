import type {
  EditorShellStatus,
  PublishState,
  RevisionLike,
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

// --- Autosave guard ---------------------------------------------------------

export interface AutosavePendingArg {
  upsertMetaApi: { isPending: boolean }
  saveDraftApi: { isPending: boolean }
  publishApi: { isPending: boolean }
  unpublishApi: { isPending: boolean }
}

export function isPendingForAutosave({
  upsertMetaApi,
  saveDraftApi,
  publishApi,
  unpublishApi,
}: AutosavePendingArg): boolean {
  return upsertMetaApi.isPending || saveDraftApi.isPending || publishApi.isPending || unpublishApi.isPending
}

// --- Publish-state derivation -----------------------------------------------

export function derivePublishState(
  latest: RevisionLike | null,
  published: RevisionLike | null,
  visible: boolean,
): PublishState {
  if (latest === null) {
    return { kind: 'not-published-yet' }
  }
  if (!visible) {
    return { kind: 'unpublished', lastPublishedRevisionNo: published?.revisionNo ?? null }
  }
  if (latest.status === 'published') {
    return { kind: 'published-current', revisionNo: latest.revisionNo }
  }
  return {
    kind: 'draft-ahead',
    draftRevisionNo: latest.revisionNo,
    publishedRevisionNo: published?.revisionNo ?? null,
  }
}

// `localInputValueToIso` parses the picker's local-tz string into ISO.
// Both Post + Page sidebars export the same helper; we accept it as a
// closure callback rather than duplicating the implementation here.
// Shell binds it via `args.toPublishedAtIso` … actually no, the
// callsites all use `meta.publishedAt` directly. We accept the parsed
// ISO from the Shell so the hook stays agnostic of input formatting.
export function parseLocalDateTime(localValue: string): number {
  return localValue === '' ? Number.NaN : Date.parse(localValue)
}

// --- Sidebar derivations ----------------------------------------------------

export function deriveSidebarPublishStatus(args: {
  isEditing: boolean
  publishState: PublishState
  publishedAt: string
}): SidebarPublishStatus | null {
  const { isEditing, publishState, publishedAt } = args
  if (!isEditing) {
    return 'never-saved'
  }
  if (publishState.kind === 'not-published-yet') {
    return 'never-saved'
  }
  if (publishState.kind === 'unpublished') {
    return 'offline'
  }
  const ts = parseLocalDateTime(publishedAt)
  const isFuture = !Number.isNaN(ts) && ts > Date.now()
  if (isFuture) {
    return 'scheduled'
  }
  return publishState.kind === 'draft-ahead' ? 'live-with-draft-ahead' : 'live'
}

export function deriveSidebarRevisionSummary(args: {
  isEditing: boolean
  publishState: PublishState
}): SidebarRevisionSummary | null {
  const { isEditing, publishState } = args
  if (!isEditing) {
    return null
  }
  switch (publishState.kind) {
    case 'not-published-yet':
      return { kind: 'no-revision' }
    case 'published-current':
      return { kind: 'published-current', revisionNo: publishState.revisionNo }
    case 'unpublished':
      return publishState.lastPublishedRevisionNo !== null
        ? { kind: 'published-current', revisionNo: publishState.lastPublishedRevisionNo }
        : { kind: 'no-revision' }
    case 'draft-ahead':
      return {
        kind: 'draft-ahead',
        draftRevisionNo: publishState.draftRevisionNo,
        publishedRevisionNo: publishState.publishedRevisionNo,
      }
  }
}

export function deriveSidebarSaveStatus(args: {
  status: EditorShellStatus
  isEditing: boolean
  isBodyDirty: boolean
  isMetaDirty: boolean
  displaySaveAtMs: number | null
}): SidebarSaveStatus {
  const { status, isEditing, isBodyDirty, isMetaDirty, displaySaveAtMs } = args
  if (status.kind === 'saving') {
    return { kind: 'saving' }
  }
  if (status.kind === 'error') {
    return { kind: 'error', message: status.message }
  }
  if (status.kind === 'conflict') {
    return { kind: 'conflict' }
  }
  if (status.kind === 'info') {
    return { kind: 'info', message: status.message }
  }
  if (!isEditing) {
    return { kind: 'unsaved' }
  }
  if (isBodyDirty || isMetaDirty) {
    return { kind: 'unsaved' }
  }
  if (displaySaveAtMs !== null) {
    return { kind: 'saved', atMs: displaySaveAtMs }
  }
  return { kind: 'unsaved' }
}
