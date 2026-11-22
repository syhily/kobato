import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()

const BASE_SETUP_DIR = 'tools/test/src/setup'
const BASE_SETUPS = ['node.ts', 'dom.ts', 'snaps.ts'] as const

function collectSetupEntries(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSetupEntries(path))
      continue
    }
    const file = relative(REPO_ROOT, path).replace(/\\/g, '/')
    if (/(?:^|\/)tests\/(?:utils\/setup\/[^/]+|setup)\.tsx?$/.test(file)) {
      files.push(file)
    }
  }
  return files
}

function readRepoFile(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf8')
}

describe('test setup ownership', () => {
  it('the product-free Node base restores real timers and stays DOM-free', () => {
    const source = readRepoFile(`${BASE_SETUP_DIR}/node.ts`)
    expect(source).toMatch(/afterEach\(\(\)\s*=>\s*\{[^}]*vi\.useRealTimers\(\)/)
    expect(source, 'the Node base must not load jest-dom').not.toContain('@testing-library/')
    expect(source, 'the Node base must not mock sonner').not.toContain('sonner')
  })

  it('the DOM setups compose the Node base instead of duplicating it', () => {
    for (const file of ['dom.ts', 'snaps.ts'] as const) {
      const source = readRepoFile(`${BASE_SETUP_DIR}/${file}`)
      expect(source, `${file} must import the Node base`).toContain("@kobato/test/setup/node'")
    }
    const dom = readRepoFile(`${BASE_SETUP_DIR}/dom.ts`)
    expect(dom).toContain('@testing-library/jest-dom/vitest')
    expect(dom).toMatch(/afterEach\(\(\)\s*=>\s*\{\s*cleanup\(\)/)
    const snaps = readRepoFile(`${BASE_SETUP_DIR}/snaps.ts`)
    expect(snaps, 'snapshot trees never mount React, so no cleanup').not.toContain('@testing-library/react')
    expect(snaps).not.toContain('jest-dom')
  })

  it('every product setup wrapper composes exactly one base and never duplicates its cleanup', () => {
    const wrappers = [
      ...collectSetupEntries(join(REPO_ROOT, 'apps')),
      ...collectSetupEntries(join(REPO_ROOT, 'packages')),
    ].sort()

    expect(wrappers.length).toBeGreaterThan(10)
    for (const file of wrappers) {
      const source = readRepoFile(file)
      const bases = [...source.matchAll(/@kobato\/test\/setup\/(node|dom|snaps)/g)].map((match) => match[1])
      expect(new Set(bases).size, `${file} must compose exactly one tools/test setup base`).toBe(1)
      expect(source, `${file}: real-timer restore is owned by the base`).not.toContain('vi.useRealTimers')
    }
  })

  it('no setup still references the retired setup names', () => {
    const entries = [
      ...collectSetupEntries(join(REPO_ROOT, 'apps')),
      ...collectSetupEntries(join(REPO_ROOT, 'packages')),
    ]
    for (const file of [...entries, ...BASE_SETUPS.map((name) => `${BASE_SETUP_DIR}/${name}`)]) {
      const source = readRepoFile(file)
      expect(source, file).not.toContain('@kobato/test/setup/unit')
      expect(source, file).not.toContain('@kobato/test/setup/it')
    }
  })
})
