// Admin dashboard wire contracts: the route loader projects recent
// drafts / published posts into `DraftSummary` and picks the empty-state
// line server-side. Isomorphic so route chunk + server share one shape.

export interface DraftSummary {
  id: string
  title: string
  updatedAtIso: string
}

export const EMPTY_STATE_LINES: ReadonlyArray<string> = [
  '审核台空空如也，今日得清闲。',
  '万事妥帖，可以安心写新东西了。',
  '一切井然有序，去泡杯茶吧。',
  '评审区一片清净，灵感时间到了。',
  '都处理完啦，去看看星辰大海。',
]

export function pickEmptyStateLine(): string {
  return EMPTY_STATE_LINES[Math.floor(Math.random() * EMPTY_STATE_LINES.length)] ?? EMPTY_STATE_LINES[0]!
}
