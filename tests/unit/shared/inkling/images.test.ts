import { describe, expect, it } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { collectInklingImageStoragePaths } from '@/shared/inkling/images'

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function makeDocument(rootChildren: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: rootChildren,
    },
  }
}

describe('shared/inkling/images — storage path collection', () => {
  it('collects top-level image storage paths and dedupes', () => {
    const doc = makeDocument([
      { type: 'image-card', version: 1, src: 'a', storagePath: 'images/a.png' },
      { type: 'image-card', version: 1, src: 'b', storagePath: 'images/a.png' },
      { type: 'image-card', version: 1, src: 'c', storagePath: 'images/b.png' },
      { type: 'image-card', version: 1, src: 'd' },
      { type: 'image-card', version: 1, src: 'e', storagePath: '' },
    ])
    expect(collectInklingImageStoragePaths(doc)).toEqual(['images/a.png', 'images/b.png'])
  })

  it('descends into solution children', () => {
    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'image-card', version: 1, src: 'a', storagePath: 'images/sol.png' }],
      },
    ])
    expect(collectInklingImageStoragePaths(doc)).toEqual(['images/sol.png'])
  })

  it('descends into two-column left and right', () => {
    const doc = makeDocument([
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'image-card', version: 1, src: 'a', storagePath: 'images/l.png' }],
        right: [{ type: 'image-card', version: 1, src: 'b', storagePath: 'images/r.png' }],
      },
    ])
    expect(collectInklingImageStoragePaths(doc)).toEqual(['images/l.png', 'images/r.png'])
  })

  it('descends into footnote definitions', () => {
    const doc = makeDocument([
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'image-card', version: 1, src: 'a', storagePath: 'images/fn.png' }],
      },
    ])
    expect(collectInklingImageStoragePaths(doc)).toEqual(['images/fn.png'])
  })
})
