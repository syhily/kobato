// The CONTENT language contract — deliberately separate from the four UI
// locales in `locales.ts`.
//
// A post/page may declare the language its own prose is written in. That is
// author-supplied metadata: it never selects a UI catalog, never triggers
// translation or detection, and never rewrites the content. The public detail
// route renders it as the body container's HTML `lang`; when unset the body
// inherits the document's UI locale (see `entry.server.tsx`).
//
// Any well-formed BCP 47 tag is legal (not just `SUPPORTED_LOCALES`), and the
// stored spelling is canonical — `Intl.getCanonicalLocales` owns the grammar
// and the casing, so `zh-hant-tw` is persisted as `zh-Hant-TW`.

/** Longest plausible BCP 47 tag (language + script + region + variants + extensions). */
export const CONTENT_LANGUAGE_MAX_LENGTH = 63

/** The canonical form of a BCP 47 tag, or `null` when the input is blank or malformed. */
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

/**
 * Whether a metadata input is acceptable: blank (unset) or a well-formed
 * BCP 47 tag. Mirrors the server's write strictness so the editor can flag a
 * bad tag before the request leaves the browser.
 */
export function isContentLanguageInput(value: string): boolean {
  return value.trim() === '' || canonicalContentLanguage(value) !== null
}
