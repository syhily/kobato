import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

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
