import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, HeadingNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  DecoratorNode,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { $enforceParagraphRestriction } from '@/plugins/behaviour/restrict-content'

// The paragraphs-only restriction policy — pins for each cleaning leg
// (decorator strip, list unwrap, non-paragraph conversion, truncation,
// selection repair) and the two gating no-ops (clean root, non-collapsed /
// missing selection). The plugin mount smoke test lives in
// test/unit/plugins/RestrictContentPlugin.test.ts.

class TestDecoratorNode extends DecoratorNode<null> {
  static getType() {
    return 'test-decorator'
  }

  static clone(node: TestDecoratorNode) {
    return new TestDecoratorNode(node.__key)
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

function $createTestDecoratorNode(): TestDecoratorNode {
  return new TestDecoratorNode()
}

// Builds the root children, places a collapsed caret at the document end,
// and runs the policy — the same shape the plugin's transform sees.
function enforce(editor: LexicalEditor, paragraphs: number, build: () => void): Promise<void> {
  return updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    build()
    root.selectEnd()
    $enforceParagraphRestriction(root, paragraphs)
  })
}

/** Root children as `type:text` entries (`decorator` for the test decorator). */
function readDoc(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((node) => {
        if (node instanceof TestDecoratorNode) {
          return 'decorator'
        }
        const type = $isParagraphNode(node) ? 'p' : node.getType()
        return `${type}:${node.getTextContent()}`
      }),
  )
}

describe('$enforceParagraphRestriction', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor({
      nodes: [ListNode, ListItemNode, HeadingNode, TestDecoratorNode],
      onError: (error) => {
        throw error
      },
    })
  })

  it('strips decorator nodes and keeps the surrounding paragraphs', async () => {
    await enforce(editor, 5, () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode('one')),
        $createTestDecoratorNode(),
        $createParagraphNode().append($createTextNode('two')),
      )
    })

    expect(readDoc(editor)).toEqual(['p:one', 'p:two'])
  })

  it('unwraps a list to a paragraph holding its first item', async () => {
    await enforce(editor, 5, () => {
      $getRoot().append(
        $createListNode('bullet').append(
          $createListItemNode().append($createTextNode('first')),
          $createListItemNode().append($createTextNode('second')),
        ),
      )
    })

    expect(readDoc(editor)).toEqual(['p:first'])
  })

  it('unwraps a list whose item was splice-wrapped around a non-item child', async () => {
    // ListNode.splice wraps any non-ListItem child in a ListItemNode on
    // append, so the declaration's empty-paragraph fallback for a list
    // without a list-item first child is unreachable through public
    // construction — the wrapped item's content is what survives.
    await enforce(editor, 5, () => {
      $getRoot().append($createListNode('bullet').append($createParagraphNode().append($createTextNode('not an item'))))
    })

    expect(readDoc(editor)).toEqual(['p:not an item'])
  })

  it('converts a non-paragraph element to a paragraph holding its children', async () => {
    await enforce(editor, 5, () => {
      $getRoot().append($createHeadingNode('h1').append($createTextNode('title')))
    })

    expect(readDoc(editor)).toEqual(['p:title'])
  })

  it('truncates the document to the paragraph budget after stripping', async () => {
    await enforce(editor, 2, () => {
      $getRoot().append(
        $createTestDecoratorNode(),
        $createParagraphNode().append($createTextNode('one')),
        $createParagraphNode().append($createTextNode('two')),
        $createParagraphNode().append($createTextNode('three')),
      )
    })

    expect(readDoc(editor)).toEqual(['p:one', 'p:two'])
  })

  it('repairs the selection to the end of the rewritten document', async () => {
    await enforce(editor, 2, () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode('one')),
        $createParagraphNode().append($createTextNode('two')),
        $createParagraphNode().append($createTextNode('three')),
      )
    })

    editor.getEditorState().read(() => {
      const last = $getRoot().getLastChild()
      expect(last && $isParagraphNode(last) && last.getTextContent() === 'two').toBe(true)
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.isCollapsed()).toBe(true)
      if ($isRangeSelection(selection)) {
        // selectEnd descends to the deepest node: the caret sits at the end
        // of the last paragraph's text
        const anchorNode = selection.anchor.getNode()
        expect(anchorNode.getTextContent()).toBe('two')
        expect(selection.anchor.offset).toBe(anchorNode.getTextContentSize())
      }
    })
  })

  it('leaves a clean root untouched (same node identity)', async () => {
    let beforeKeys: NodeKey[] = []
    await enforce(editor, 3, () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode('one')),
        $createParagraphNode().append($createTextNode('two')),
      )
      beforeKeys = $getRoot()
        .getChildren()
        .map((node) => node.getKey())
    })

    editor.getEditorState().read(() => {
      expect(
        $getRoot()
          .getChildren()
          .map((node) => node.getKey()),
      ).toEqual(beforeKeys)
    })
  })

  it('no-ops against a non-collapsed selection', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const text = $createTextNode('title')
      root.append($createHeadingNode('h1').append(text))
      text.select(0, 3)
      $enforceParagraphRestriction(root, 5)
    })

    expect(readDoc(editor)).toEqual(['heading:title'])
  })

  it('no-ops without a selection', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.append($createHeadingNode('h1').append($createTextNode('title')))
      expect($getSelection()).toBeNull()
      $enforceParagraphRestriction(root, 5)
    })

    expect(readDoc(editor)).toEqual(['heading:title'])
  })

  it('does not trip on list paragraphs produced by earlier legs', async () => {
    // mixed document: decorator stripped, list unwrapped, heading converted,
    // then the budget applied to the cleaned result
    await enforce(editor, 2, () => {
      $getRoot().append(
        $createTestDecoratorNode(),
        $createListNode('bullet').append($createListItemNode().append($createTextNode('first'))),
        $createHeadingNode('h1').append($createTextNode('title')),
        $createParagraphNode().append($createTextNode('tail')),
      )
    })

    expect(readDoc(editor)).toEqual(['p:first', 'p:title'])
  })
})
