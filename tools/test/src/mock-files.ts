import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Test files that hold module-level mock calls (`vi.mock(` / `vi.doMock(`).
// Under `isolate: false` the module registry is shared per worker, so a
// file's mock wiring leaks into every other file — mock holders must keep
// per-file isolation. They run in the dedicated `*-iso-*` projects;
// de-mocking a file moves it back into the shared project automatically
// (the list is scanned, not pinned).
const MOCK_MARKERS = ['vi.mock(', 'vi.doMock('] as const

export function mockIsolatedTestFiles(absRoot: string, repoRoot: string): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
        const source = readFileSync(full, 'utf8')
        if (MOCK_MARKERS.some((marker) => source.includes(marker))) {
          files.push(relative(repoRoot, full).split(sep).join('/'))
        }
      }
    }
  }
  walk(absRoot)
  return files
}
