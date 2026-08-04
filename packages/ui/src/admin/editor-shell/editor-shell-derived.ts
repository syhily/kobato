import type {
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  PublishState,
  RevisionLike,
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@kobato/ui/admin/editor-shell/editor-shell-types'

import { parseLocalDateTimeInput } from '@kobato/ui/admin/editor-shell/editor-datetime'

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

// --- Baseline revision projection -------------------------------------------

// The baseline revision is the server's most advanced copy of the body: the
// latest revision when one exists, else the published one. This precedence
// has a single owner — every consumer (body seed, bodyKey, expected token,
// conflict-dialog timestamp) derives from these two projections.
export function deriveBaselineRevision<TEntity extends EntityLike>(
  detail: EditorShellDetail<TEntity> | undefined,
): RevisionLike | null {
  if (detail === undefined) {
    return null
  }
  return detail.latestRevision ?? detail.publishedRevision
}

// ms-since-epoch of the baseline revision's last update, falling back to the
// entity row's own `updatedAt` when no revision exists yet (a freshly created
// entity whose first saveDraft leg failed still has a meaningful timestamp).
export function deriveBaselineUpdatedAtMs<TEntity extends EntityLike>(
  detail: EditorShellDetail<TEntity> | undefined,
): number | null {
  if (detail === undefined) {
    return null
  }
  const iso = deriveBaselineRevision(detail)?.updatedAt ?? detail.entity.updatedAt
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
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
  const ts = parseLocalDateTimeInput(publishedAt)?.getTime() ?? Number.NaN
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
  if (status.kind === 'warning') {
    return { kind: 'warning', message: status.message }
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
