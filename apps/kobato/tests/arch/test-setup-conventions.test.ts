import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

function collectSetupEntries(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSetupEntries(path))
      continue
    }
    const file = relative(REPO_ROOT, path).replace(/\\/g, '/')
    if (
      /(?:^|\/)tests\/(?:utils\/setup\/[^/]+|setup)\.tsx?$/.test(file) ||
      /^tools\/test\/src\/setup\/[^/]+\.ts$/.test(file)
    ) {
      files.push(file)
    }
  }
  return files
}

describe('test setup ownership', () => {
  it('restores real timers in every direct setup entry', () => {
    const files = [
      ...collectSetupEntries(join(REPO_ROOT, 'apps')),
      ...collectSetupEntries(join(REPO_ROOT, 'packages')),
      ...collectSetupEntries(join(REPO_ROOT, 'tools/test/src/setup')),
    ].sort()

    expect(files.length).toBeGreaterThan(10)
    expect(files).toEqual(
      expect.arrayContaining([
        'packages/inkling/tests/setup.ts',
        'packages/server/tests/utils/setup/unit.ts',
        'tools/test/src/setup/unit.ts',
      ]),
    )
    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8')
      expect(source, file).toMatch(/afterEach\(\(\)\s*=>\s*\{[^}]*vi\.useRealTimers\(\)/)
    }
  })
})
