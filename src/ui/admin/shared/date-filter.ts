import { isRecord } from '@/shared/utils/type-guards'

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
