import { EDITOR_BASE_NODES } from '@kobato/inkling'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { excludeBaseNodes } from '@kobato/web-client/editor/base-node-filter'
import { describe, expect, it } from 'vitest'

type Entry = { getType?: () => string; replace?: { getType?: () => string } }

function typesOf(entries: readonly unknown[]): { classes: string[]; pairs: string[] } {
  const classes: string[] = []
  const pairs: string[] = []
  for (const entry of entries) {
    const klass = unsafeCast<Entry>(entry)
    if (typeof klass.getType === 'function') {
      classes.push(klass.getType())
    } else if (typeof klass.replace?.getType === 'function') {
      pairs.push(klass.replace.getType())
    }
  }
  return { classes, pairs }
}

describe('excludeBaseNodes', () => {
  it('excludes a node class by its static getType', () => {
    const filtered = excludeBaseNodes(EDITOR_BASE_NODES, new Set(['aside']))
    const { classes, pairs } = typesOf(filtered)
    expect(classes).not.toContain('aside')
    expect(filtered).toHaveLength(EDITOR_BASE_NODES.length - 1)
    expect(pairs).toEqual(typesOf(EDITOR_BASE_NODES).pairs)
  })

  it('excludes a replacement pair by the replaced class type', () => {
    const filtered = excludeBaseNodes(EDITOR_BASE_NODES, new Set(['quote']))
    const { classes, pairs } = typesOf(filtered)
    expect(classes).not.toContain('quote')
    expect(pairs).not.toContain('quote')
    expect(filtered).toHaveLength(EDITOR_BASE_NODES.length - 2)
    expect(classes).toContain('extended-quote')
  })

  it('keeps every entry when the exclusion set is empty', () => {
    const filtered = excludeBaseNodes(EDITOR_BASE_NODES, new Set())
    expect(filtered).toEqual([...EDITOR_BASE_NODES])
  })
})
