// Heading-anchor slug policy for the Lexical storage format (plan
// docs/plans/inkling-editor-replacement.md, round R9a). Single source of
// truth on the kobato side: a byte-exact port of inkling's `slugify`
// (`packages/inkling/src/utils/slugify.ts`, the >=4.0 branch every current
// document takes) plus its per-render dedup tracker
// (`packages/inkling/src/utils/heading-id-tracker.ts`). The contract test
// `tests/unit/shared/contracts/lexical-heading-slug.test.ts` pins this
// module against inkling's real `lexicalStateToHtml` export, so the
// `headings` derived column can never drift from the ids the exported
// `bodyHtml` carries (R3 consistency obligation).
//
// Do NOT route this through `@/shared/slug` (github-slugger parity with a
// pinyin charmap): inkling keeps CJK characters and percent-encodes, which
// is the export contract the feed/TOC anchors must match.

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
 * Per-document dedup tracker, identical to inkling's
 * `createHeadingIdTracker`: the first use of a slug gets the base id,
 * repeats get `<base>-<n>` with n counting from 1. Build one tracker per
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
