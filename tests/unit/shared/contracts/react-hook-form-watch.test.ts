import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contract: no render-time `.watch(...)` calls on react-hook-form instances.
//
// The client bundle runs through the React Compiler
// (`src/server/infra/react-compiler-plugin.ts`), which memoizes the call with
// the stable `form` object as its only dependency — the watched value freezes
// at its initial state and every controlled input fed by it snaps back on
// each keystroke (the 流控设置 number cells were the live symptom). Vitest
// never compiles, so only a source scan catches a regression. Use the
// `useWatch({ control, name })` hook instead — hook calls re-execute on every
// render, so the compiler cannot cache the subscribed value away.

const SCANNED_ROOTS = ['src/ui', 'src/client', 'src/routes']
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
