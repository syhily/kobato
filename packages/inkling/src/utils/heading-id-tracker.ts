// The single heading-id dedup policy both markdown engines share. The renderer's
// hyphenated form is authoritative because its output is the export contract; the paste
// dialect aligns to it. Each render pass builds a fresh tracker, so dedup state never
// leaks across renders.

/** One per-render heading-id tracker: base id on first use, `<base>-<n>` on repeats. */
export function createHeadingIdTracker(): (base: string) => string {
  const usedIdAttributes: Record<string, number> = {}
  return (base) => {
    const seen = usedIdAttributes[base]
    if (seen === undefined) {
      usedIdAttributes[base] = 1
      return base
    }
    usedIdAttributes[base] = seen + 1
    return `${base}-${seen}`
  }
}
