import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { AsideNode } from '@/nodes/AsideNode'
import {
  $cycleQuoteBlock,
  $formatBlocksToHeading,
  $formatBlocksToParagraph,
  FORMAT_BLOCK_TYPES,
  registerFormatToolbarState,
  resolveFormatToolbarVisibility,
  type FormatToolbarState,
} from '@/plugins/behaviour/format-toolbar'

const TEST_NODES = [ListNode, ListItemNode, HeadingNode, QuoteNode, AsideNode]

function createTestEditor(nodes = TEST_NODES): LexicalEditor {
  return createEditor({ namespace: 'test', nodes, onError: () => {} })
}

async function buildParagraphWithSelection(editor: LexicalEditor, text = 'hello') {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    paragraph.append($createTextNode(text))
    $getRoot().append(paragraph)
    paragraph.selectStart()
  })
}

describe('registerFormatToolbarState', () => {
  let editor: LexicalEditor
  let published: FormatToolbarState[]

  beforeEach(() => {
    editor = createTestEditor()
    // the classifier's block-type leg requires a reconciled DOM element
    editor.setRootElement(document.createElement('div'))
    published = []
  })

  it('publishes the default snapshot at registration', () => {
    registerFormatToolbarState(editor, (state) => published.push(state))
    expect(published).toEqual([{ isBold: false, isItalic: false, blockType: 'paragraph' }])
  })

  it('publishes text formats and the block type per update', async () => {
    await buildParagraphWithSelection(editor)
    registerFormatToolbarState(editor, (state) => published.push(state))

    await updateEditor(editor, () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.formatText('bold')
      }
    })

    const last = published[published.length - 1]
    expect(last.isBold).toBe(true)
    expect(last.blockType).toBe('paragraph')
  })

  it('resolves heading tags as block types', async () => {
    await buildParagraphWithSelection(editor)
    registerFormatToolbarState(editor, (state) => published.push(state))

    $formatBlocksToHeading(editor, 'h2')
    await tick()

    expect(published[published.length - 1].blockType).toBe('h2')
    expect(FORMAT_BLOCK_TYPES.has('h2')).toBe(true)
  })

  it('resolves list types as block types', async () => {
    await updateEditor(editor, () => {
      const list = new ListNode('bullet', 1)
      const item = new ListItemNode()
      item.append($createTextNode('item'))
      list.append(item)
      $getRoot().append(list)
      item.selectStart()
    })
    registerFormatToolbarState(editor, (state) => published.push(state))

    expect(published[published.length - 1].blockType).toBe('bullet')
  })
})

describe('block-format surgeries', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor()
    await buildParagraphWithSelection(editor)
  })

  function firstChildType(): string | undefined {
    return editor.getEditorState().read(() => $getRoot().getFirstChild()?.getType())
  }

  it('$formatBlocksToHeading sets the heading tag', async () => {
    $formatBlocksToHeading(editor, 'h3')
    await tick()
    expect(firstChildType()).toBe('heading')
  })

  it('$formatBlocksToParagraph reverts a heading to a paragraph', async () => {
    $formatBlocksToHeading(editor, 'h3')
    await tick()
    $formatBlocksToParagraph(editor)
    await tick()
    expect(firstChildType()).toBe('paragraph')
  })

  it('$cycleQuoteBlock cycles quote → aside → paragraph → quote', async () => {
    $cycleQuoteBlock(editor, 'paragraph')
    await tick()
    expect(firstChildType()).toBe('quote')

    $cycleQuoteBlock(editor, 'quote')
    await tick()
    expect(firstChildType()).toBe('aside')

    $cycleQuoteBlock(editor, 'aside')
    await tick()
    expect(firstChildType()).toBe('paragraph')

    $cycleQuoteBlock(editor, 'paragraph')
    await tick()
    expect(firstChildType()).toBe('quote')
  })
})

describe('resolveFormatToolbarVisibility', () => {
  it('shows everything when the surface composes the nodes and the host can create snippets', () => {
    const editor = createTestEditor()
    expect(resolveFormatToolbarVisibility(editor, { isSnippetsEnabled: true, canCreateSnippet: true })).toEqual({
      hideHeading: false,
      hideQuotes: false,
      hideSnippets: false,
      hideBold: false,
    })
  })

  it('hides headings and quotes when their nodes are not composed', () => {
    const editor = createEditor({ namespace: 'test', nodes: [], onError: () => {} })
    const visibility = resolveFormatToolbarVisibility(editor, { isSnippetsEnabled: true, canCreateSnippet: true })
    expect(visibility.hideHeading).toBe(true)
    expect(visibility.hideQuotes).toBe(true)
  })

  it('hides snippets when disabled or the host cannot create them', () => {
    const editor = createTestEditor()
    expect(
      resolveFormatToolbarVisibility(editor, { isSnippetsEnabled: false, canCreateSnippet: true }).hideSnippets,
    ).toBe(true)
    expect(
      resolveFormatToolbarVisibility(editor, { isSnippetsEnabled: true, canCreateSnippet: false }).hideSnippets,
    ).toBe(true)
  })

  it('hides bold when the surface declares it in hiddenFormats', () => {
    const editor = createTestEditor()
    expect(resolveFormatToolbarVisibility(editor, { canCreateSnippet: true, hiddenFormats: ['bold'] }).hideBold).toBe(
      true,
    )
  })
})
