export function skeletonKeys(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `skel-${i}`)
}
