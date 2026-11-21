export function idFromString(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Invalid id number: ${value}`)
    }
    return value
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new TypeError(`Invalid id string: ${value}`)
  }
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`Id exceeds the safe integer range: ${value}`)
  }
  return parsed
}

export function idStr(value: number | string): string {
  return String(value)
}
