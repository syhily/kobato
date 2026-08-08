import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contract: every `<Select>` call site must show a human-readable label in
// the trigger, never the raw `value` — via `items` on the root or a children
// function on `<SelectValue>`.

const UI_ROOTS = [resolve(process.cwd(), 'src/ui'), resolve(process.cwd(), 'src/routes')]

// Select family child tags, so they aren't mistaken for the root `<Select>`.
const SELECT_CHILDREN = [
  'Content',
  'Item',
  'Trigger',
  'Value',
  'Group',
  'Label',
  'Separator',
  'List',
  'Popup',
  'Portal',
  'Positioner',
  'Backdrop',
  'Icon',
  'Indicator',
  'Text',
  'ScrollUpArrow',
  'ScrollDownArrow',
] as const

function stripComments(source: string): string {
  // Strip comments only; `{...}` JSX and `https://` URLs must survive.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Every `<Select ...>` root opening tag: `{ attrs, block }` (block = body up to `</Select>`). */
function findSelectRoots(source: string): { attrs: string; block: string; line: number }[] {
  const roots: { attrs: string; block: string; line: number }[] = []
  // `<Select` not followed by a child name; optional generic; attrs may span lines.
  const rootRe = new RegExp(`<Select(?!${SELECT_CHILDREN.join('|')})(?:<[^>]*>)?([\\s\\S]*?)>`, 'g')
  let match: RegExpExecArray | null
  while ((match = rootRe.exec(source)) !== null) {
    const attrs = match[1]
    const blockStart = match.index + match[0].length
    const close = source.indexOf('</Select>', blockStart)
    const block = close === -1 ? '' : source.slice(blockStart, close)
    roots.push({
      attrs,
      block,
      line: source.slice(0, match.index).split('\n').length,
    })
  }
  return roots
}

function collectCallSites(): { file: string; offenders: { line: number; reason: string }[] }[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.name.endsWith('.tsx')) {
        files.push(path)
      }
    }
  }
  for (const root of UI_ROOTS) {
    walk(root)
  }

  const results: { file: string; offenders: { line: number; reason: string }[] }[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('@/ui/components/select')) {
      continue
    }
    const stripped = stripComments(source)
    const offenders: { line: number; reason: string }[] = []
    for (const { attrs, block, line } of findSelectRoots(stripped)) {
      const svStart = block.indexOf('<SelectValue')
      if (svStart === -1) {
        continue
      }
      const hasItems = attrs.includes('items=')
      const svEnd = block.indexOf('</SelectValue>', svStart)
      const hasChildrenFn = svEnd !== -1 && block.slice(svStart, svEnd).includes('=>')
      if (!hasItems && !hasChildrenFn) {
        offenders.push({
          line,
          reason: '<SelectValue> without `items` on the root or a children function would render the raw value',
        })
      }
    }
    if (offenders.length > 0) {
      results.push({ file: file.replace(`${process.cwd()}/`, ''), offenders })
    }
  }
  return results
}

describe('contract: select call sites display labels, not raw values', () => {
  it('every <Select> with a bare <SelectValue> carries an `items` prop', () => {
    const results = collectCallSites()
    expect(results).toEqual([])
  })
})
