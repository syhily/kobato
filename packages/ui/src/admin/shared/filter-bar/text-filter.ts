import { isRecord } from '@kobato/shared/utils/type-guards'

// Generic pill-value codec for the operator + free-text filter kind
// (`{op, value}` serialized as a JSON string). The operator vocabulary is
// per-field — comments pairs 包含 / 不包含 while my-comments pins the single
// 包含 operator — so parse / label take the field's operator list instead of
// hardcoding one. Parsing never throws: malformed payloads return null and
// the editor falls back to its default state.

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
