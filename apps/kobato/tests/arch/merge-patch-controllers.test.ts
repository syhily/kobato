import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = process.cwd()
const CONTROLLERS_DIR = join(PROJECT_ROOT, 'packages/server/src/http/controllers')

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
