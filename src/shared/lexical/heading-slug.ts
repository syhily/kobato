// Heading-anchor slug policy for the Lexical storage format: a byte-exact port
// of inkling's `slugify` (`src/inkling/utils/slugify.ts`) plus its per-render
// dedup tracker (`src/inkling/utils/heading-id-tracker.ts`), pinned by
// tests/unit/shared/contracts/lexical-heading-slug.test.ts against inkling's
// real `lexicalStateToHtml` export so the `headings` column cannot drift from
// the ids the exported `bodyHtml` carries.
//
// Do NOT route through `@/shared/slug` (github-slugger with a pinyin charmap):
// inkling keeps CJK characters and percent-encodes — the export contract the
// feed/TOC anchors must match.

const SYMBOL_PATTERN = /[\][!"#$%&'()*+,./:;<=>?@\\^_{|}~]/g

/** Byte-exact port of inkling's `slugify(text)` at the default (4.0+) policy. */
export function slugifyHeadingText(text: string): string {
  return encodeURIComponent(
    text
      .trim()
      .toLowerCase()
      .replace(SYMBOL_PATTERN, '')
      .replace(/\s+/g, '-')
      .replace(/^-|-{2,}|-$/g, ''),
  )
}

/**
 * Per-document dedup tracker (inkling's `createHeadingIdTracker`): first use
 * gets the base id, repeats get `<base>-<n>` counting from 1. Build one per
 * collection pass — dedup state must never leak across documents.
 */
export function createHeadingSlugTracker(): (base: string) => string {
  const usedSlugs: Record<string, number> = {}
  return (base) => {
    const seen = usedSlugs[base]
    if (seen === undefined) {
      usedSlugs[base] = 1
      return base
    }
    usedSlugs[base] = seen + 1
    return `${base}-${seen}`
  }
}
