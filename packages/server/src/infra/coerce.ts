export function safeBigInt(value: string): number | null {
  try {
    const parsed = Number(value)
    return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isNumeric(str: string): boolean {
  return /^-?\d+$/.test(str)
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}
