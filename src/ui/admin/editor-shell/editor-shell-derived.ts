import type {
  EditorShellDetail,
  EditorShellStatus,
  EntityLike,
  PublishState,
  RevisionLike,
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { parseLocalDateTimeInput } from '@/ui/admin/editor-shell/editor-datetime'

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

// Baseline = latest revision, else the published one — single owner; every
// consumer (body seed, bodyKey, expected token) derives from these projections.
export function deriveBaselineRevision<TEntity extends EntityLike>(
  detail: EditorShellDetail<TEntity> | undefined,
): RevisionLike | null {
  if (detail === undefined) {
    return null
  }
  return detail.latestRevision ?? detail.publishedRevision
}

// Baseline revision's ms-since-epoch, falling back to the entity row's own
// `updatedAt` when no revision exists yet.
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
