import { $isElementNode, createEditor, type CreateEditorArgs, type LexicalNode } from 'lexical'
import { describe, expect, test } from 'vitest'

import { DEFAULT_NODES } from '@/'
import generateEditorState, { _$generateNodesFromHTML } from '@/utils/generateEditorState'

describe('Utils: generateEditorState', () => {
  function runGenerateEditorState(
    html: string,
    { nodes = DEFAULT_NODES }: { nodes?: NonNullable<CreateEditorArgs['nodes']> } = {},
  ) {
    const editor = createEditor({
      // lexical swallows errors inside updates by default,
      // so we need to throw them to fail the test
      onError: (error) => {
        throw error
      },
      nodes,
    })
    const editorState = generateEditorState({ editor, initialHtml: html })
    return editorState.toJSON()
  }

  test('can generate editor state from basic paragraph', function () {
    const html = '<p>Test</p>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(1)
    expect(editorState.root).toMatchObject({
      children: [{ type: 'paragraph', children: [{ text: 'Test' }] }],
    })
  })

  test('handles whitespace between paragraphs', function () {
    const html = '<p>Test</p> <p>Test2</p>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(2)
    expect(editorState.root).toMatchObject({
      children: [
        { type: 'paragraph', children: [{ text: 'Test' }] },
        { type: 'paragraph', children: [{ text: 'Test2' }] },
      ],
    })
  })

  test('handles multiple spans inside paragraph', function () {
    const html = '<p><span>Test</span> <span>Test2</span></p>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root).toMatchObject({
      children: [{ type: 'paragraph', children: [{ text: 'Test Test2' }] }],
    })
  })

  test('handles multiple spans with no wrapper', function () {
    const html = '<span>Test</span> <span>Test2</span>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(1)
    expect(editorState.root).toMatchObject({
      children: [{ type: 'paragraph', children: [{ text: 'Test Test2' }] }],
    })
  })

  test('handles line breaks inside paragraph', function () {
    const html = '<p>Test<br>Test2</p>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ text: 'Test' }, { type: 'linebreak' }, { text: 'Test2' }],
    })
  })

  test('handles line breaks with no wrapper', function () {
    const html = 'Test<br>Test2'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(1)
    expect(editorState.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ text: 'Test' }, { type: 'linebreak' }, { text: 'Test2' }],
    })
  })

  test('handles line breaks and spans with no wrapper', function () {
    const html = '<span>Test</span><br><span>Test2</span>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(1)
    expect(editorState.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ text: 'Test' }, { type: 'linebreak' }, { text: 'Test2' }],
    })
  })

  // https://github.com/facebook/lexical/issues/2807
  test('handles whitespace between list items', function () {
    const html = '<ul><li>Test</li> <li>Test2</li></ul>'
    const editorState = runGenerateEditorState(html)

    expect(editorState.root.children).toHaveLength(1)
    const list = editorState.root.children[0]
    if (!list || !('children' in list) || !Array.isArray(list.children)) {
      throw new Error('Expected a serialized list with children')
    }
    expect(list.children).toHaveLength(2)
    expect(editorState.root.children[0]).toMatchObject({
      type: 'list',
      children: [
        { type: 'listitem', children: [{ text: 'Test' }] },
        { type: 'listitem', children: [{ text: 'Test2' }] },
      ],
    })
  })

  describe('_$generateNodesFromHTML', () => {
    function requireElementNode(node: LexicalNode | undefined) {
      if (!$isElementNode(node)) {
        throw new Error('Expected generated element node')
      }
      return node
    }

    function testGenerateNodesFromHTML(html: string, callback: (nodes: LexicalNode[]) => void) {
      const editor = createEditor({
        // lexical swallows errors inside updates by default,
        // so we need to throw them to fail the test
        onError: (error) => {
          throw error
        },
      })
      editor.update(
        () => {
          const nodes = _$generateNodesFromHTML(editor, html)
          callback(nodes)
        },
        { discrete: true },
      )
    }

    test('can generate basic paragraph node from html', function () {
      const html = '<p>Test</p>'
      testGenerateNodesFromHTML(html, (nodes) => {
        expect(nodes.length).toEqual(1)
        expect(nodes[0].getType()).toEqual('paragraph')
        expect(nodes[0].getTextContent()).toEqual('Test')
      })
    })

    test('handles single span inside paragraph', function () {
      const html = '<p><span>Test</span></p>'
      testGenerateNodesFromHTML(html, (nodes) => {
        const paragraph = requireElementNode(nodes[0])
        expect(paragraph.getChildren().length).toEqual(1)
        expect(paragraph.getChildren()[0].getType()).toEqual('text')
      })
    })

    test('handles multiple spans inside paragraph', function () {
      const html = '<p><span>Test</span> <span>Test2</span></p>'
      testGenerateNodesFromHTML(html, (nodes) => {
        const paragraph = requireElementNode(nodes[0])
        expect(paragraph.getChildren().length).toEqual(3)
        expect(paragraph.getChildren()[0].getTextContent()).toEqual('Test')
        expect(paragraph.getChildren()[1].getTextContent()).toEqual(' ')
        expect(paragraph.getChildren()[2].getTextContent()).toEqual('Test2')
      })
    })

    test('handles multiple spans with no wrapper', function () {
      const html = '<span>Test</span> <span>Test2</span>'
      testGenerateNodesFromHTML(html, (nodes) => {
        expect(nodes.length).toEqual(3)
        expect(nodes[0].getTextContent()).toEqual('Test')
        expect(nodes[1].getTextContent()).toEqual(' ')
        expect(nodes[2].getTextContent()).toEqual('Test2')
      })
    })
  })
})
