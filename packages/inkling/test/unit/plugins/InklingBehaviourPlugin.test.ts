import { renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  createEditor,
  type LexicalEditor,
  type LexicalNodeConfig,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { updateEditor } from '#/utils/test-editor'
import { HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { DESELECT_CARD_COMMAND, INSERT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import InklingBehaviourPlugin from '@/plugins/InklingBehaviourPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(nodes: LexicalNodeConfig[] = []) {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode, HorizontalRuleNode, ...nodes],
    onError: () => {},
  })
}

// Mount the plugin under a per-composer card selection store provider, the
// same store InklingComposer provides in production (plan 038 — no
// whole-context mock).
function renderPlugin() {
  return renderHook(() => InklingBehaviourPlugin({}), { wrapper: createCardSelectionStoreWrapper().wrapper })
}

describe('InklingBehaviourPlugin', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor()
    mockComposerContext(editor)
  })

  it('renders and registers commands as an aggregator', async () => {
    renderPlugin()

    // Smoke test: ensure the plugin registered the command listeners by
    // dispatching a few commands with valid editor state.
    let imageNode: ImageNode
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      root.append(paragraph)
      paragraph.select()

      imageNode = $createImageNode({ src: '/image.png' })
    })

    let insertedCardNode
    const removeListener = editor.registerCommand(
      INSERT_CARD_COMMAND,
      (payload) => {
        insertedCardNode = payload.cardNode
        return true
      },
      0,
    )

    expect(editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: imageNode! })).toBe(true)
    expect(insertedCardNode).toBeDefined()
    expect(editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: imageNode!.getKey() })).toBe(true)

    removeListener()
  })

  it('registers its command listeners once per mount, not per render', () => {
    const registerCommandSpy = vi.spyOn(editor, 'registerCommand')

    const { rerender, unmount } = renderPlugin()
    const registrationsAfterMount = registerCommandSpy.mock.calls.length
    expect(registrationsAfterMount).toBeGreaterThan(0)

    rerender()
    rerender()
    rerender()

    // Handlers read card selection synchronously from the store, so forced
    // re-renders must not tear down and re-register the listeners (plan 038
    // step 5).
    expect(registerCommandSpy.mock.calls.length).toBe(registrationsAfterMount)

    unmount()
  })

  it('scopes outside-click deselect to the editor root when no containerElem is passed', async () => {
    const root = document.createElement('div')
    root.contentEditable = 'true'
    document.body.appendChild(root)
    editor.setRootElement(root)
    const querySelectorSpy = vi.spyOn(document, 'querySelector')

    renderPlugin()

    let cardKey = ''
    await updateEditor(editor, () => {
      const image = $createImageNode({ src: '/image.png' })
      $getRoot().append(image)
      cardKey = image.getKey()
    })
    // select through the plugin's store-backed command, dispatched inside an
    // update so the node selection commits deterministically (the
    // dispatchAndCommit convention from registerKeyboardNavigation.test.ts)
    await updateEditor(editor, () => {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey })
    })

    // higher-priority observer so the deselect dispatch is recorded without
    // swallowing it before the plugin's own handler
    const deselected: string[] = []
    const unregister = editor.registerCommand(
      DESELECT_CARD_COMMAND,
      ({ cardKey: deselectedKey }) => {
        deselected.push(deselectedKey)
        return false
      },
      COMMAND_PRIORITY_HIGH,
    )

    const outsideElement = document.createElement('div')
    document.body.appendChild(outsideElement)
    outsideElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(deselected).toEqual([cardKey])
    // the fallback must not resurrect the legacy .inkling-editor lookup
    expect(querySelectorSpy).not.toHaveBeenCalledWith('.inkling-editor')

    unregister()
    querySelectorSpy.mockRestore()
    root.remove()
    outsideElement.remove()
  })
})
