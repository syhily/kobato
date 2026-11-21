export const CONTENT_LANGUAGE_MAX_LENGTH = 63

export function canonicalContentLanguage(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null
  } catch {
    return null
  }
}

export function isContentLanguageInput(value: string): boolean {
  return value.trim() === '' || canonicalContentLanguage(value) !== null
}
