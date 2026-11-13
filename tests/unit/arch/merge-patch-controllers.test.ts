import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Multi-column field-update procedures must use the shared merge-patch
// contract (`mergePatchInput` / `splitMergePatch` from
// `@/shared/contracts/merge-patch`) — see `src/server/AGENTS.md` → Adding an
// endpoint. The hand-rolled conditional spread `...(x !== undefined && { x })`
// is the pre-contract signature: it re-implements the "absent = untouched"
// projection by hand, cannot express "null = clear" consistently, and is what
// let the user-edit clear bug ship. This scan keeps controllers off it.

const PROJECT_ROOT = process.cwd()
const CONTROLLERS_DIR = join(PROJECT_ROOT, 'src/server/http/controllers')

const HAND_ROLLED_PATCH = /\.\.\.\s*\(\s*\w+(?:\.\w+)*\s*!==\s*undefined\s*&&\s*\{/

function walk(dir: string, callback: (filePath: string) => void) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, callback)
    } else if (stat.isFile() && entry.endsWith('.ts')) {
      callback(fullPath)
    }
  }
}

describe('merge-patch controller contract', () => {
  it('the detector recognizes the hand-rolled patch spread', () => {
    expect(HAND_ROLLED_PATCH.test('...(name !== undefined && { name })')).toBe(true)
    expect(HAND_ROLLED_PATCH.test('...(input.link !== undefined && { link: input.link })')).toBe(true)
    expect(HAND_ROLLED_PATCH.test('splitMergePatch(input)')).toBe(false)
  })

  it('controllers never hand-roll `...(x !== undefined && { x })` patch spreads', () => {
    const violations: string[] = []
    walk(CONTROLLERS_DIR, (filePath) => {
      const source = readFileSync(filePath, 'utf-8')
      if (HAND_ROLLED_PATCH.test(source)) {
        violations.push(relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'))
      }
    })
    expect(violations).toEqual([])
  })
})
