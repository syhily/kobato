// The single heading-id dedup policy both markdown engines share: the first
// use of a slug gets the base id, repeats get `<base>-<n>` with n counting
// from 1. Before this seam the two engines numbered duplicates differently
// (the HTML renderer emitted `base-1` while the paste dialect concatenated
// `base2`) — the same heading got a different id per dialect. The
// renderer's hyphenated form is the one policy because its output is the
// export contract; the paste dialect aligns to it. Each render pass builds
// a fresh tracker (the render context per exportDOM run, the markdown-it
// `env` slot per render), so dedup state never leaks across renders.

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
