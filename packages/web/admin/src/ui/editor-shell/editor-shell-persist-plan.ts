import type { SaveBodyOutput } from '@kobato/api/contracts/revision'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { EditorShellStatus, RevisionLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types'

import { areLexicalEditorStatesEquivalent } from '@kobato/inkling/headless/equivalence'
import { localInputValueToIso } from '@kobato/web-admin/ui/editor-shell/editor-datetime'

export type SaveBodyVerdict =
  | { kind: 'conflict'; expectedToken: string }
  | { kind: 'saved'; revision: RevisionLike; warning: string | undefined }

export function verdictBodySave(payload: SaveBodyOutput): SaveBodyVerdict {
  if (payload.status === 'conflict') {
    return { kind: 'conflict', expectedToken: payload.expectedToken }
  }
  return { kind: 'saved', revision: payload.revision, warning: payload.warning }
}

export type BodySavePlan =
  | { kind: 'conflict'; expectedToken: string }
  | {
      kind: 'saved'
      status: EditorShellStatus
      revision: RevisionLike
      consumePendingSnapshot: boolean
    }

export function planBodySave(
  payload: SaveBodyOutput,
  pendingSnapshot: LexicalEditorState | null,
  now: Date,
): BodySavePlan {
  const verdict = verdictBodySave(payload)
  if (verdict.kind === 'conflict') {
    return { kind: 'conflict', expectedToken: verdict.expectedToken }
  }
  return {
    kind: 'saved',
    status: verdict.warning !== undefined ? { kind: 'warning', message: verdict.warning } : { kind: 'saved', at: now },
    revision: verdict.revision,
    consumePendingSnapshot: pendingSnapshot !== null,
  }
}

export interface DraftSavePlan {
  publishedAt: string | null | undefined
  bodyDiverged: boolean
  bannerLegs: 1 | 2
}

export function planDraftSave(args: {
  pickerPublishedAt: string
  serverPublishedAtIso: string | null
  now: number
  body: LexicalEditorState
  lastSavedBody: LexicalEditorState
}): DraftSavePlan {
  const pickerIso = localInputValueToIso(args.pickerPublishedAt)
  const serverIsScheduled =
    args.serverPublishedAtIso !== null && (Date.parse(args.serverPublishedAtIso) || 0) > args.now
  const publishedAt = pickerIso ?? (serverIsScheduled ? null : undefined)
  const bodyDiverged = !areLexicalEditorStatesEquivalent(args.body, args.lastSavedBody)
  return { publishedAt, bodyDiverged, bannerLegs: bodyDiverged ? 2 : 1 }
}

export function planCreatePublishedAt(pickerPublishedAt: string): string | undefined {
  return localInputValueToIso(pickerPublishedAt) ?? undefined
}

export interface PublishPlan {
  publishedAtField: string | undefined
  optimisticServerPublishedAtIso: string
}

export function planPublish(args: { pickerPublishedAt: string; nowIso: string }): PublishPlan {
  const pickerIso = localInputValueToIso(args.pickerPublishedAt)
  return {
    publishedAtField: pickerIso ?? undefined,
    optimisticServerPublishedAtIso: pickerIso ?? args.nowIso,
  }
}
