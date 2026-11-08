import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { I18nValue } from '@/ui/lib/I18nProvider'

import { isRecord } from '@/shared/utils/type-guards'

// Pill-value contract for admin date filters: Range (`{from,to}`) and Single + operator (`{date,op}`), both serialized to a JSON string pill value.
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

export function dateFilterLabel(value: DateFilterValue, t: I18nValue['t']): string {
  if (value.from && value.to) {
    return `${value.from} ~ ${value.to}`
  }
  if (value.from) {
    return t('admin.filter.date.from', { from: value.from })
  }
  if (value.to) {
    return t('admin.filter.date.to', { to: value.to })
  }
  return t('admin.filter.date.label')
}

export type SingleDateFilterOperator = 'is-less' | 'is-or-less' | 'is-greater' | 'is-or-greater'

export const SINGLE_DATE_FILTER_OPERATORS: readonly { value: SingleDateFilterOperator }[] = [
  { value: 'is-less' },
  { value: 'is-or-less' },
  { value: 'is-greater' },
  { value: 'is-or-greater' },
] as const

export const SINGLE_DATE_FILTER_OPERATOR_LABEL_IDS: Record<SingleDateFilterOperator, UiMessageId> = {
  'is-less': 'admin.filter.date.op.isLess',
  'is-or-less': 'admin.filter.date.op.isOrLess',
  'is-greater': 'admin.filter.date.op.isGreater',
  'is-or-greater': 'admin.filter.date.op.isOrGreater',
}

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

export function singleDateFilterLabel(value: SingleDateFilterValue, t: I18nValue['t']): string {
  return t('admin.filter.date.value', { op: t(SINGLE_DATE_FILTER_OPERATOR_LABEL_IDS[value.op]), date: value.date })
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
