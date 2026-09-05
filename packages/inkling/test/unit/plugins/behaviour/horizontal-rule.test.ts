import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $setSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick } from '#/utils/test-editor'
import { $isHorizontalRuleNode, HorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@/nodes/HorizontalRuleNode'
import {
  $insertHorizontalRule,
  registerHorizontalRuleInsert,
  registerHorizontalRuleScan,
  resolveDividerScanTarget,
} from '@/plugins/behaviour/horizontal-rule'

describe('horizontal-rule behaviour', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    const rootElement = document.createElement('div')
    rootElement.contentEditable = 'true'
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      nodes: [HorizontalRuleNode],
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
  })

  function selectInFirstParagraph(offset = 0) {
    editor.update(() => {
      const paragraph = $getRoot().getFirstChild()
      if ($isParagraphNode(paragraph)) {
        paragraph.select(offset, offset)
      }
    })
  }

  describe('$insertHorizontalRule', () => {
    it('inserts the rule before a blank paragraph, keeping the caret paragraph', async () => {
      editor.update(() => {
        $getRoot().append($createParagraphNode())
      })
      selectInFirstParagraph()

      let result = false
      editor.update(() => {
        result = $insertHorizontalRule()
      })
      await tick()

      expect(result).toBe(true)
      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren()
        expect(children).toHaveLength(2)
        expect($isHorizontalRuleNode(children[0])).toBe(true)
        expect($isParagraphNode(children[1])).toBe(true)
      })
    })

    it('splits a non-empty paragraph and inserts the rule before the fresh blank', async () => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('hello'))
        $getRoot().append(paragraph)
      })
      selectInFirstParagraph(2)

      editor.update(() => {
        $insertHorizontalRule()
      })
      await tick()

      editor.getEditorState().read(() => {
        const types = $getRoot()
          .getChildren()
          .map((child) => child.getType())
        expect(types).toEqual(['paragraph', 'horizontalrule', 'paragraph'])
        expect($getRoot().getChildren()[0].getTextContent()).toBe('hello')
      })
    })

    it('returns false without a range selection', () => {
      editor.update(() => {
        $setSelection(null)
      })

      let result: boolean | undefined
      editor.update(() => {
        result = $insertHorizontalRule()
      })

      expect(result).toBe(false)
    })
  })

  describe('registerHorizontalRuleInsert', () => {
    it('dispatches through the command', async () => {
      registerHorizontalRuleInsert(editor)
      editor.update(() => {
        $getRoot().append($createParagraphNode())
      })
      selectInFirstParagraph()

      expect(editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)).toBe(true)
      await tick()

      editor.getEditorState().read(() => {
        expect($isHorizontalRuleNode($getRoot().getFirstChild())).toBe(true)
      })
    })

    it('registers nothing when the card is not registered', () => {
      const bare = createEditor({
        namespace: 'test',
        nodes: [],
        onError: (error) => {
          throw error
        },
      })
      registerHorizontalRuleInsert(bare)

      expect(bare.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)).toBe(false)
    })
  })

  describe('resolveDividerScanTarget', () => {
    it('resolves the paragraph when the caret sits on ---', async () => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('---'))
        $getRoot().append(paragraph)
      })
      selectInFirstParagraph(3)
      // let the paragraph render so the native caret can be set on its text
      await tick()

      // the guard reads the native caret — set it directly (jsdom's selection
      // reconciliation needs a focused editor, which unit editors are not)
      const textNode = editor.getRootElement()!.querySelector('p span[data-lexical-text]')!.firstChild!
      const nativeSelection = window.getSelection()!
      nativeSelection.collapse(textNode, textNode.textContent?.length ?? 0)

      let node = null
      editor.getEditorState().read(() => {
        node = resolveDividerScanTarget(editor)
      })

      expect(node).not.toBeNull()
    })

    it.each([
      ['a non-divider paragraph', 'hello'],
      ['a partial divider', '--'],
    ])('returns null for %s', (_label, text) => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(text))
        $getRoot().append(paragraph)
      })
      selectInFirstParagraph(1)

      let node = null
      editor.getEditorState().read(() => {
        node = resolveDividerScanTarget(editor)
      })

      expect(node).toBeNull()
    })

    it('returns null for a non-collapsed selection', () => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('---'))
        $getRoot().append(paragraph)
        paragraph.select(0, 3)
      })

      let node = null
      editor.getEditorState().read(() => {
        node = resolveDividerScanTarget(editor)
      })

      expect(node).toBeNull()
    })
  })

  describe('registerHorizontalRuleScan', () => {
    it('transforms a typed --- into the card', async () => {
      registerHorizontalRuleScan(editor)
      editor.update(() => {
        const paragraph = $createParagraphNode()
        $getRoot().append(paragraph)
        paragraph.select()
      })
      await tick()

      editor.update(() => {
        const paragraph = $getRoot().getFirstChild()
        if ($isParagraphNode(paragraph)) {
          const text = $createTextNode('---')
          paragraph.append(text)
          text.select(3, 3)
        }
      })
      await tick()

      editor.getEditorState().read(() => {
        expect($isHorizontalRuleNode($getRoot().getFirstChild())).toBe(true)
      })
    })
  })
})
