import { describe, expect, it } from 'vitest'

import type { FootnoteDefinitionBlock, NonRecursiveBlock } from '@/shared/pt/schema'

import { footnoteDefinitionBlockToPmNode } from '@/shared/pt/bridge/nodes/footnote'

let keyCounter = 0
function key(prefix: string): string {
  keyCounter += 1
  return `${prefix}${keyCounter}`
}

function textBlock(text: string, marks?: string[], markDefs?: unknown[]): NonRecursiveBlock {
  return {
    _type: 'block',
    _key: key('b'),
    style: 'normal',
    children: [{ _type: 'span', _key: key('s'), text, marks }],
    markDefs: markDefs as never,
  } as NonRecursiveBlock
}

function fnDef(defKey: string, index: number, children: NonRecursiveBlock[] = []): FootnoteDefinitionBlock {
  return { _type: 'footnoteDefinition', _key: defKey, index, children }
}

describe('shared/pt/bridge/nodes/footnote — footnoteDefinitionBlockToPmNode', () => {
  it('pushes the provided children as content via the provided pushBlocks callback', () => {
    const def = fnDef('fn1', 1, [textBlock('hello')])
    const pushed: unknown[] = []
    // pushBlocks must write into the FIRST argument (the inner accumulator).
    const pushBlocks = (target: unknown[], blocks: readonly unknown[]) => {
      target.push(...blocks)
      pushed.push(...blocks)
    }
    const node = footnoteDefinitionBlockToPmNode(def as never, pushBlocks as never)
    expect(node.type).toBe('footnoteDefinition')
    expect(node.attrs).toEqual({ _key: 'fn1', index: 1 })
    expect(pushed).toHaveLength(1)
    expect(node.content).toHaveLength(1)
  })

  it('injects a placeholder paragraph when the definition has no children', () => {
    const def = fnDef('fn2', 2, [])
    const pushBlocks = () => {} // leaves inner empty
    const node = footnoteDefinitionBlockToPmNode(def as never, pushBlocks as never)
    expect(node.content).toEqual([{ type: 'paragraph' }])
  })
})
