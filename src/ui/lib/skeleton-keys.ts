// Stable, index-free keys for static-length skeleton placeholders.
// Fixed-length skeleton rows never reorder, so the `.map` index tripping
// oxlint's `react/no-array-index-key` is a false positive; this helper hands
// out opaque string keys so call sites need no per-site rule disable.
//
// Usage:
//   skeletonKeys(5).map((key) => <Skeleton key={key} className="h-8" />)

export function skeletonKeys(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `skel-${i}`)
}
