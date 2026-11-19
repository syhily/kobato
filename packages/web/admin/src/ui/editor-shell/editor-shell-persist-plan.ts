import type { SaveBodyOutput } from '@kobato/contracts/revision.ts'
import type { LexicalEditorState } from '@kobato/lexical/schema.ts'
import type { EditorShellStatus, RevisionLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'

import { areLexicalEditorStatesEquivalent } from '@kobato/lexical/equivalence.ts'
import { localInputValueToIso } from '@kobato/web-admin/ui/editor-shell/editor-datetime.ts'

// Pure save planners for the editor persist module: wire-payload and
// status-transition decisions live here so the orchestration is testable without
// rendering React. The hooks apply these plans verbatim — no decisions there.

/**
 * Classify a body-save wire result once. 'conflict' is interpreted ONLY here:
 * every persist flow consumes this verdict instead of re-reading `payload.status`.
 */
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
      /** `warning` when the save landed with a non-fatal side-effect failure. */
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
  /** `undefined` = omit the field, `null` = cancel the server schedule, string = set it. */
  publishedAt: string | null | undefined
  bodyDiverged: boolean
  bannerLegs: 1 | 2
}

export function planDraftSave(args: {
  /** Raw datetime-local picker value ('' = cleared). */
  pickerPublishedAt: string
  serverPublishedAtIso: string | null
  now: number
  body: LexicalEditorState
  lastSavedBody: LexicalEditorState
}): DraftSavePlan {
  const pickerIso = localInputValueToIso(args.pickerPublishedAt)
  const serverIsScheduled =
    args.serverPublishedAtIso !== null && (Date.parse(args.serverPublishedAtIso) || 0) > args.now
  // Picker cleared while the server holds a schedule: explicit `null` (the
  // cancel-schedule signal); with no schedule the field is omitted entirely.
  const publishedAt = pickerIso ?? (serverIsScheduled ? null : undefined)
  const bodyDiverged = !areLexicalEditorStatesEquivalent(args.body, args.lastSavedBody)
  return { publishedAt, bodyDiverged, bannerLegs: bodyDiverged ? 2 : 1 }
}

/** Create-mode publishedAt: empty picker means "no schedule supplied" — omit
 *  the field so the server applies its default instead of the cancel signal. */
export function planCreatePublishedAt(pickerPublishedAt: string): string | undefined {
  return localInputValueToIso(pickerPublishedAt) ?? undefined
}

export interface PublishPlan {
  publishedAtField: string | undefined
  /** Optimistic server publishedAt — reverted to the pre-publish truth on error. */
  optimisticServerPublishedAtIso: string
}

export function planPublish(args: { pickerPublishedAt: string; nowIso: string }): PublishPlan {
  const pickerIso = localInputValueToIso(args.pickerPublishedAt)
  return {
    publishedAtField: pickerIso ?? undefined,
    optimisticServerPublishedAtIso: pickerIso ?? args.nowIso,
  }
}
