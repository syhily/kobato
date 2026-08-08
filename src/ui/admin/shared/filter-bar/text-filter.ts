import { isRecord } from '@/shared/utils/type-guards'

// Pill-value codec for operator + free-text filters (`{op, value}` as JSON).
// Operators are per-field; parsing never throws — malformed → null.
export interface TextFilterOperatorOption {
  value: string
  label: string
}

export interface TextFilterValue {
  op: string
  value: string
}

export function parseTextFilterValue(
  raw: string | undefined,
  operators: readonly TextFilterOperatorOption[],
): TextFilterValue | null {
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return null
    }
    const { op, value } = parsed
    if (typeof op !== 'string' || typeof value !== 'string') {
      return null
    }
    if (!operators.some((o) => o.value === op)) {
      return null
    }
    return { op, value }
  } catch {
    return null
  }
}

export function textFilterValueLabel(v: TextFilterValue, operators: readonly TextFilterOperatorOption[]): string {
  const opLabel = operators.find((o) => o.value === v.op)?.label ?? ''
  const trimmed = v.value.trim()
  const excerpt = trimmed.length > 8 ? `${trimmed.slice(0, 8)}…` : trimmed
  return excerpt ? `${opLabel}「${excerpt}」` : opLabel
}
