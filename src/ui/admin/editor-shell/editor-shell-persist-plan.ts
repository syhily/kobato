import type { SaveBodyOutput } from '@/shared/contracts/revision'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { EditorShellStatus, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { localInputValueToIso } from '@/ui/admin/editor-shell/editor-datetime'

// Pure save planners for the editor persist module: every wire-payload and
// status-transition decision lives here so the orchestration logic is
// testable without rendering React. The hook interpreters in
// use-editor-shell-persist apply these plans verbatim — no decisions there.

/**
 * Classify a body-save wire result once. 'conflict' is interpreted ONLY here —
 * the persist flows (mutation legs, autosave flush, create) all consume this
 * verdict instead of re-reading `payload.status`.
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

/** The full state transition for a landed body save (mutation leg or autosave flush). */
export type BodySavePlan =
  | { kind: 'conflict'; expectedToken: string }
  | {
      kind: 'saved'
      /** `warning` when the save landed with a non-fatal side-effect failure. */
      status: EditorShellStatus
      revision: RevisionLike
      /** Consume the pending manual-save snapshot into the autosave baseline. */
      consumePendingSnapshot: boolean
    }

export function planBodySave(
  payload: SaveBodyOutput,
  pendingSnapshot: PortableTextBody | null,
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

/** Wire decisions for the manual draft save (persistSave). */
export interface DraftSavePlan {
  /** `undefined` = omit the field, `null` = cancel the server schedule, string = set it. */
  publishedAt: string | null | undefined
  bodyDiverged: boolean
  /** Action-banner leg count: meta only, or meta + body. */
  bannerLegs: 1 | 2
}

export function planDraftSave(args: {
  /** Raw datetime-local picker value ('' = cleared). */
  pickerPublishedAt: string
  serverPublishedAtIso: string | null
  now: number
  body: PortableTextBody
  lastSavedBody: PortableTextBody
}): DraftSavePlan {
  const pickerIso = localInputValueToIso(args.pickerPublishedAt)
  const serverIsScheduled =
    args.serverPublishedAtIso !== null && (Date.parse(args.serverPublishedAtIso) || 0) > args.now
  // Picker cleared while the server holds a schedule: explicit `null` (the
  // cancel-schedule signal); with no schedule the field is omitted entirely.
  const publishedAt = pickerIso ?? (serverIsScheduled ? null : undefined)
  const bodyDiverged = !arePortableTextBodiesEquivalent(args.body, args.lastSavedBody)
  return { publishedAt, bodyDiverged, bannerLegs: bodyDiverged ? 2 : 1 }
}

/** Create-mode publishedAt: empty picker means "no schedule supplied" — omit
 *  the field so the server applies its default instead of the cancel signal. */
export function planCreatePublishedAt(pickerPublishedAt: string): string | undefined {
  return localInputValueToIso(pickerPublishedAt) ?? undefined
}

/** Wire + optimistic-state decisions for the publish leg. */
export interface PublishPlan {
  /** Include only when the picker holds a value. */
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
