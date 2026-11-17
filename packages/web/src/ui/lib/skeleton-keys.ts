// Opaque, index-free keys for static-length skeleton rows (`.map` index would
// trip `react/no-array-index-key`; fixed rows never reorder).

export function skeletonKeys(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `skel-${i}`)
}
