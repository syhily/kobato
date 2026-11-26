import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SCANNED_ROOTS = [
  'packages/web/admin/src/ui/',
  'apps/kobato/src/routes/',
  'packages/web/kit/src/ui/shared/editor/',
  'packages/web/kit/src/ui/comments/',
  'packages/web/public/src/ui/comments/',
]
const SOURCE_FILE = /\.[tj]sx?$/
const WATCH_CALL = /\.\s*watch\s*\(/

function walk(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = `${root}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
      out.push(full)
    }
  }
}

describe('contract: react-hook-form watch', () => {
  it('no render-time form.watch(...) call sites — use useWatch instead', () => {
    const sources: string[] = []
    for (const root of SCANNED_ROOTS) {
      walk(root, sources)
    }
    const offenders: string[] = []
    for (const file of sources) {
      const content = readFileSync(file, 'utf8')
      if (WATCH_CALL.test(content)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
