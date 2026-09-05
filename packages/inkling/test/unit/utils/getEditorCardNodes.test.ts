import { createEditor, DecoratorNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import { INSERT_IMAGE_COMMAND } from '@/nodes/cards/card-commands'
import { getEditorCardNodes, getRegisteredCardNodes } from '@/nodes/cards/editor-card-nodes'
import DEFAULT_NODES from '@/nodes/DefaultNodes'

// a card-shaped node with no matching declaration: the declarations are the
// source of truth, so looking like a card does not make a node a card
class UndeclaredCardNode extends DecoratorNode<null> {
  static getType() {
    return 'undeclared-card'
  }

  static clone() {
    return new UndeclaredCardNode()
  }

  createDOM() {
    return document.createElement('div')
  }

  updateDOM() {
    return false
  }

  decorate() {
    return null
  }
}

describe('getEditorCardNodes', () => {
  it('returns an empty array when no card nodes are registered', () => {
    expect(getEditorCardNodes(createEditor({ onError: () => {} }))).toEqual([])
  })

  it('returns every declared card for an editor with the default node set, in declaration order', () => {
    const editor = createEditor({ nodes: DEFAULT_NODES, onError: () => {} })

    expect(getEditorCardNodes(editor).map(([nodeType]) => nodeType)).toEqual([
      'codeblock',
      'horizontalrule',
      'image',
      'audio',
      'video',
      'callout',
      'html',
      'file',
      'button',
      'toggle',
      'header',
      'bookmark',
      'gallery',
      'math',
      'footnotedefinition',
    ])
  })

  it('ignores a registered node with a cardMenu static but no declaration', () => {
    const editor = createEditor({ nodes: [UndeclaredCardNode], onError: () => {} })

    expect(getEditorCardNodes(editor)).toEqual([])
  })
})

describe('getRegisteredCardNodes', () => {
  it('returns no declarations for an empty registered-type set', () => {
    expect(getRegisteredCardNodes(new Set())).toEqual([])
  })

  it('omits declarations whose node type is not registered', () => {
    const cardNodes = getRegisteredCardNodes(new Set(['image']))

    expect(cardNodes.map(([nodeType]) => nodeType)).toEqual(['image'])
  })

  it('ignores registered types with no declaration', () => {
    const cardNodes = getRegisteredCardNodes(new Set(['paragraph', 'image']))

    expect(cardNodes.map(([nodeType]) => nodeType)).toEqual(['image'])
  })

  it('preserves declaration order regardless of set insertion order', () => {
    const cardNodes = getRegisteredCardNodes(new Set(['video', 'image']))

    expect(cardNodes.map(([nodeType]) => nodeType)).toEqual(['image', 'video'])
  })

  it('carries the declaration-derived menu entries and upload key', () => {
    const cards = new Map(getRegisteredCardNodes(new Set(['image', 'audio', 'video', 'file', 'bookmark'])))

    expect(cards.get('image')?.uploadType).toBe('image')
    expect(cards.get('audio')?.uploadType).toBe('audio')
    expect(cards.get('video')?.uploadType).toBe('video')
    expect(cards.get('file')?.uploadType).toBe('file')
    expect(cards.get('bookmark')?.uploadType).toBeUndefined()

    // resolved through resolveCardMenuEntries: the icon id and command are already bound
    expect(cards.get('image')?.cardMenu?.[0]?.label).toBe('Image')
    expect(cards.get('image')?.cardMenu?.[0]?.insertCommand).toBe(INSERT_IMAGE_COMMAND)
  })

  it('includes menu-less cards with an undefined cardMenu (CodeBlock)', () => {
    const cards = new Map(getRegisteredCardNodes(new Set(['codeblock'])))

    expect(cards.get('codeblock')?.cardMenu).toBeUndefined()
    expect(cards.get('codeblock')?.uploadType).toBeUndefined()
  })
})
