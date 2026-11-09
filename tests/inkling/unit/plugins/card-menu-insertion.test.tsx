import { act, renderHook } from '@testing-library/react'
import { $createParagraphNode, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/inkling/utils/composer-context'
import { createHostIntegrationWrapper } from '#/inkling/utils/host-integration-wrapper'
import { createTestEditor, tick, updateEditor } from '#/inkling/utils/test-editor'
import { useCardMenu } from '@/inkling/hooks/useCardMenu'
import { $isImageNode, ImageNode } from '@/inkling/nodes/ImageNode'
import { createCardPickerStore } from '@/inkling/plugins/behaviour/cardPickerStore'
import { createCardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'
import { registerCardCommands } from '@/inkling/plugins/behaviour/registerCardCommands'
import { CardInsertPlugin } from '@/inkling/plugins/CardInsertPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// The menu data under test is the REAL image declaration's, resolved through
// the same projection the editor mounts (`getEditorCardNodes` →
// `resolveCardMenuEntries`) and dispatched into the real registrar. The
// assertions deliberately pin the DECLARED params (`insertParams` /
// `queryParams`) as resolved menu data, while the insertion path itself is
// exercised as-is — no test-side card/menu declaration is duplicated here.

function createImageEditor(): LexicalEditor {
  return createTestEditor({ nodes: [ImageNode] })
}

async function mountInsertRegistrar(editor: LexicalEditor) {
  mockComposerContext(editor)
  renderHook(() => CardInsertPlugin())
  await tick()
}

async function placeCaret(editor: LexicalEditor) {
  await updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    root.append(paragraph)
    paragraph.select()
  })
}

function readInsertedImage(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const node = $getRoot()
      .getChildren()
      .find((child) => $isImageNode(child))
    if (!$isImageNode(node)) {
      return undefined
    }
    return { triggerFileDialog: node.__triggerFileDialog, src: node.src }
  })
}

describe('card declaration menu data → CardInsertPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function insertImageEntry(query: string, commandParams?: string[]) {
    editor = createImageEditor()
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore: createCardPickerStore() })
    await mountInsertRegistrar(editor)
    await placeCaret(editor)

    const { result } = renderHook(() => useCardMenu(editor, query, { commandParams }), {
      wrapper: createHostIntegrationWrapper(),
    })
    const item = result.current.cardMenu.items.find((entry) => entry.label === 'Image')
    expect(item).toBeDefined()

    act(() => {
      result.current.insert(item!.insertCommand!, item)
    })
    await tick()
    return item!
  }

  it("constructs the image from the declaration's insertParams (__triggerFileDialog)", async () => {
    const item = await insertImageEntry('image')

    // the declaration's own params reached the dataset
    expect(item.insertParams).toEqual({ triggerFileDialog: true })

    const image = readInsertedImage(editor)
    expect(image).toEqual({ triggerFileDialog: true, src: '' })
  })

  it('maps a typed slash param through the declaration queryParams onto the constructed image', async () => {
    const item = await insertImageEntry('image', ['https://example.com/typed.png'])

    // image's declaration names `src` as its one query param
    expect(item.queryParams).toEqual(['src'])

    // a typed src suppresses the file dialog (the transient initial's rule)
    expect(readInsertedImage(editor)).toEqual({
      triggerFileDialog: false,
      src: 'https://example.com/typed.png',
    })
  })
})
