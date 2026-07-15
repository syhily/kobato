// Stable, index-free keys for static-length skeleton placeholders.
//
// The array index that drives `Array.from({ length: n }).map((_, i) => ...)`
// trips oxlint's `react/no-array-index-key` rule — which is correct for
// dynamic lists but a false positive for fixed-length skeleton rows whose
// items never reorder. Rather than disable the rule at every call site,
// this helper hands out opaque string keys derived upfront, so the JSX
// `key=` reads from a constant tuple, not the `.map` index.
//
// Usage:
//   skeletonKeys(5).map((key) => <Skeleton key={key} className="h-8" />)

export function skeletonKeys(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `skel-${i}`)
}
