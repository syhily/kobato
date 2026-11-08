import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export type SessionSortField = 'lastActive' | 'loginTime' | 'userName'
export type MySessionSortField = 'lastActive' | 'loginTime'
export type SessionSortDirection = 'asc' | 'desc'

export interface SessionSortOption<T extends string = SessionSortField> {
  value: T
  /** Display label message id — the select resolves it through the UI translator. */
  labelId: UiMessageId
  defaultDirection: SessionSortDirection
}

export interface SessionSortState<T extends string = SessionSortField> {
  field: T
  direction: SessionSortDirection
}

export const DEFAULT_ADMIN_SORT: SessionSortField = 'lastActive'
export const DEFAULT_MY_SORT: MySessionSortField = 'lastActive'

export const SESSION_SORT_OPTIONS: SessionSortOption[] = [
  { value: 'lastActive', labelId: 'common.sort.lastActive', defaultDirection: 'desc' },
  { value: 'loginTime', labelId: 'common.sort.loginTime', defaultDirection: 'desc' },
  { value: 'userName', labelId: 'common.sort.userName', defaultDirection: 'asc' },
]

export const MY_SESSION_SORT_OPTIONS: SessionSortOption<MySessionSortField>[] = [
  { value: 'lastActive', labelId: 'common.sort.lastActive', defaultDirection: 'desc' },
  { value: 'loginTime', labelId: 'common.sort.loginTime', defaultDirection: 'desc' },
]

export function parseSessionSort<T extends string>(
  raw: string | null,
  options: SessionSortOption<T>[],
  defaultField: T,
): SessionSortState<T> {
  const fallback = options.find((o) => o.value === defaultField) ?? options[0]
  if (!fallback) {
    throw new Error('At least one sort option is required')
  }

  if (!raw) {
    return { field: fallback.value, direction: fallback.defaultDirection }
  }

  const isReverse = raw.startsWith('-')
  const field = isReverse ? raw.slice(1) : raw
  const option = options.find((o) => o.value === field)
  if (!option) {
    return { field: fallback.value, direction: fallback.defaultDirection }
  }

  const direction: SessionSortDirection = isReverse
    ? option.defaultDirection === 'asc'
      ? 'desc'
      : 'asc'
    : option.defaultDirection

  return { field: option.value, direction }
}

export function serializeSessionSort<T extends string>(
  sort: SessionSortState<T>,
  options: SessionSortOption<T>[],
): string {
  const option = options.find((o) => o.value === sort.field)
  if (!option) {
    return sort.field
  }
  if (sort.direction === option.defaultDirection) {
    return sort.field
  }
  return `-${sort.field}`
}
