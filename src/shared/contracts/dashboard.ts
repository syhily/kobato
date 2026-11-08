// Admin dashboard wire contracts: the route loader projects recent
// drafts / published posts into `DraftSummary` and picks the empty-state
// line id server-side. Isomorphic so route chunk + server share one shape.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export interface DraftSummary {
  id: string
  title: string
  updatedAtIso: string
}

export const EMPTY_STATE_LINE_IDS: ReadonlyArray<UiMessageId> = [
  'admin.welcome.empty.line1',
  'admin.welcome.empty.line2',
  'admin.welcome.empty.line3',
  'admin.welcome.empty.line4',
  'admin.welcome.empty.line5',
]

/** Picked by the loader (stable across SSR + hydration) and resolved by the panel's `t`. */
export function pickEmptyStateLineId(): UiMessageId {
  return EMPTY_STATE_LINE_IDS[Math.floor(Math.random() * EMPTY_STATE_LINE_IDS.length)] ?? EMPTY_STATE_LINE_IDS[0]!
}
