import type { LexicalEditor, EditorConfig } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestDom } from '#/inkling/utils/render-live'
import { editorTest } from '#/inkling/utils/test-editor'
import {
  AtLinkNode,
  $createAtLinkNode,
  $isAtLinkNode,
  $createAtLinkSearchNode,
  AtLinkSearchNode,
} from '@/inkling/nodes/base/index'

const editorNodes = [AtLinkNode, AtLinkSearchNode]

describe('AtLinkNode', function () {
  let editor: LexicalEditor

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })

    const { window } = createTestDom('<!doctype html><html><body></body></html>')
    // jsdom 30 exposes document/window as getter-only on the test global —
    // the swap has to go through defineProperty (configurable, so the
    // afterEach delete still restores the ambient jsdom globals)
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'DOMParser', { value: window.DOMParser, configurable: true, writable: true })
  })

  afterEach(function () {
    delete (global as Record<string, unknown>).document
    delete (global as Record<string, unknown>).window
    delete (global as Record<string, unknown>).DOMParser
  })

  it(
    'matches node with $isAtLinkNode',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        expect($isAtLinkNode(atLinkNode)).toBe(true)
      },
    ),
  )

  it(
    'can be constructed with link format',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(1)
        expect(atLinkNode.getLinkFormat()!).toBe(1)
      },
    ),
  )

  it(
    'defaults link format to null when called without args',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode()
        expect(atLinkNode.getLinkFormat()).toBe(null)
      },
    ),
  )

  it(
    'can be cloned with all data',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(1)
        const atLinkNodeClone = AtLinkNode.clone(atLinkNode)

        expect(atLinkNode.__key).toBe(atLinkNodeClone.__key)
        expect(atLinkNodeClone.getLinkFormat()!).toBe(1)
      },
    ),
  )

  it(
    'exports all data via exportJSON()',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(1)
        expect(atLinkNode.exportJSON()).toEqual({
          children: [],
          direction: null,
          format: '',
          indent: 0,
          linkFormat: 1,
          type: 'at-link',
          version: 1,
        })
      },
    ),
  )

  it(
    'imports all data via importJSON()',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = AtLinkNode.importJSON({ linkFormat: 1 } as ReturnType<AtLinkNode['exportJSON']>)
        expect(atLinkNode.getLinkFormat()!).toBe(1)
      },
    ),
  )

  it(
    'uses theme class when creating DOM',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        const dom = atLinkNode.createDOM({ theme: { atLink: 'multiple classes' } } as unknown as EditorConfig)
        expect(dom.classList.contains('multiple')).toBe(true)
        expect(dom.classList.contains('classes')).toBe(true)
      },
    ),
  )

  it(
    'never updates dom after creation',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        expect(atLinkNode.updateDOM()).toBe(false)
      },
    ),
  )

  it(
    'can get and set link format',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        atLinkNode.setLinkFormat(1)
        expect(atLinkNode.getLinkFormat()!).toBe(1)
      },
    ),
  )

  it(
    'returns an empty element for exportDOM()',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        const atLinkSearchNode = $createAtLinkSearchNode('test')
        atLinkNode.append(atLinkSearchNode)
        const { element, type } = atLinkNode.exportDOM()

        expect(element).toBeDefined()
        expect(element).not.toBeNull()
        expect(type).toBe('inner')
        expect(element.tagName).toBe('SPAN')
        expect(element.innerHTML).toBe('')
        expect(element.outerHTML).toBe('<span></span>')
      },
    ),
  )

  it(
    'returns blank string for .getTextContent()',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        const atLinkSearchNode = $createAtLinkSearchNode('test')
        atLinkNode.append(atLinkSearchNode)
        expect(atLinkNode.getTextContent()).toBe('')
      },
    ),
  )

  it(
    'is inline',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        expect(atLinkNode.isInline()).toBe(true)
      },
    ),
  )

  it(
    'cannot be empty',
    editorTest(
      () => editor,
      function () {
        const atLinkNode = $createAtLinkNode(null)
        expect(atLinkNode.canBeEmpty()).toBe(false)
      },
    ),
  )
})
