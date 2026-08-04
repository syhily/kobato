import { isRecord } from '@kobato/shared/utils/type-guards'

// Pill-value contract for the admin date filters, in two modes: **Range**
// (`{from, to}`, audit log) and **Single date + operator** (`{date, op}`,
// comments filters). Both serialize to a JSON string pill value; each mode
// has its own parse / label / bounds-resolver trio below, disambiguated by
// the `SingleDate` prefix.

export interface DateFilterValue {
  from: string
  to: string
}

export function parseDateFilter(value: string | undefined): DateFilterValue | null {
  if (!value) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) {
      return null
    }
    const from = typeof parsed.from === 'string' ? parsed.from : ''
    const to = typeof parsed.to === 'string' ? parsed.to : ''
    if (!from && !to) {
      return null
    }
    return { from, to }
  } catch {
    return null
  }
}

export function dateFilterLabel(value: DateFilterValue): string {
  if (value.from && value.to) {
    return `${value.from} ~ ${value.to}`
  }
  if (value.from) {
    return `自 ${value.from}`
  }
  if (value.to) {
    return `至 ${value.to}`
  }
  return '时间'
}

export function resolveDateFilterBounds(value: DateFilterValue | null): {
  from: string | undefined
  to: string | undefined
} {
  if (!value) {
    return { from: undefined, to: undefined }
  }
  return {
    from: value.from || undefined,
    to: value.to || undefined,
  }
}

export type SingleDateFilterOperator = 'is-less' | 'is-or-less' | 'is-greater' | 'is-or-greater'

export const SINGLE_DATE_FILTER_OPERATORS: readonly { value: SingleDateFilterOperator; label: string }[] = [
  { value: 'is-less', label: '之前' },
  { value: 'is-or-less', label: '不晚于' },
  { value: 'is-greater', label: '之后' },
  { value: 'is-or-greater', label: '不早于' },
] as const

export const DEFAULT_SINGLE_DATE_OPERATOR: SingleDateFilterOperator = 'is-or-less'

export function isSingleDateFilterOperator(value: unknown): value is SingleDateFilterOperator {
  return value === 'is-less' || value === 'is-or-less' || value === 'is-greater' || value === 'is-or-greater'
}

export interface SingleDateFilterValue {
  date: string
  op: SingleDateFilterOperator
}

export function parseSingleDateFilter(value: string | undefined): SingleDateFilterValue | null {
  if (!value) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) {
      return null
    }
    const date = typeof parsed.date === 'string' ? parsed.date : ''
    const op = parsed.op
    if (!date || !isSingleDateFilterOperator(op)) {
      return null
    }
    return { date, op }
  } catch {
    return null
  }
}

export function singleDateFilterLabel(value: SingleDateFilterValue): string {
  const opLabel = SINGLE_DATE_FILTER_OPERATORS.find((o) => o.value === value.op)?.label ?? ''
  return `${opLabel} ${value.date}`
}

export function resolveSingleDateFilterBounds(value: SingleDateFilterValue | null): {
  after: string | undefined
  before: string | undefined
} {
  if (!value) {
    return { after: undefined, before: undefined }
  }
  const start = new Date(value.date)
  if (Number.isNaN(start.getTime())) {
    return { after: undefined, before: undefined }
  }
  start.setHours(0, 0, 0, 0)
  const end = new Date(value.date)
  end.setHours(23, 59, 59, 999)
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  switch (value.op) {
    case 'is-less':
      return { after: undefined, before: startIso }
    case 'is-or-less':
      return { after: undefined, before: endIso }
    case 'is-greater':
      return { after: endIso, before: undefined }
    case 'is-or-greater':
      return { after: startIso, before: undefined }
  }
}
