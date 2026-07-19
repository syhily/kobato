// Semver-lite comparison for release tags (plan 090). Strips a leading `v`,
// compares numeric `x.y.z` triples; pre-release suffixes beyond the dev gate
// (`-dev` is refused upstream by the self-update gate) are ignored.

function parseTriple(version: string): [number, number, number] {
  const core = version.replace(/^v/, '').split('-', 2)[0] ?? ''
  const parts = core.split('.')
  const nums: number[] = []
  for (let i = 0; i < 3; i++) {
    const n = Number.parseInt(parts[i] ?? '', 10)
    nums.push(Number.isNaN(n) ? 0 : n)
  }
  return [nums[0]!, nums[1]!, nums[2]!]
}

export function isNewerVersion(latest: string, current: string): boolean {
  const [lx, ly, lz] = parseTriple(latest)
  const [cx, cy, cz] = parseTriple(current)
  if (lx !== cx) {
    return lx > cx
  }
  if (ly !== cy) {
    return ly > cy
  }
  return lz > cz
}
