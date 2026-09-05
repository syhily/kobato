import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { CardActionToolbar, type CardToolbarItem } from '@/components/ui/CardActionToolbar'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { ButtonNode } from '@/nodes/ButtonNode'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function getToolbars(container: HTMLElement, card = 'button') {
  return container.querySelectorAll(`[data-inkling-card-toolbar="${card}"]`)
}

describe('CardActionToolbar', () => {
  let editor: LexicalEditor
  let nodeKey: NodeKey

  beforeEach(async () => {
    editor = createEditor({ namespace: 'test', nodes: [ButtonNode], onError: () => {} })
    mockComposerContext(editor)
    // the toolbar label resolves from the node's own type via the card
    // declaration, so the toolbar renders against a real card node
    nodeKey = await new Promise<NodeKey>((resolve) => {
      editor.update(
        () => {
          const node = new ButtonNode({
            buttonText: 'Subscribe',
            buttonUrl: 'https://example.com',
            alignment: 'center',
          })
          $getRoot().append(node)
        },
        { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
      )
    })
  })

  function renderToolbar({
    selected = true,
    editing = false,
    cardConfig = {},
    props = {},
  }: {
    selected?: boolean
    editing?: boolean
    cardConfig?: CardConfig
    props?: Partial<Parameters<typeof CardActionToolbar>[0]>
  } = {}) {
    const composerValue = createHostIntegrationValue({ cardConfig })
    const { wrapper: CardSelectionStoreProvider } = createCardSelectionStoreWrapper({
      initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
    })
    return render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <CardActionToolbar nodeKey={nodeKey} {...props} />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )
  }

  describe('visibility', () => {
    it('renders the menu toolbar with the card attribute when selected', () => {
      const { container } = renderToolbar()

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeTruthy()
    })

    it('hides the menu toolbar when the card is not selected', () => {
      const { container } = renderToolbar({ selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the menu toolbar while editing by default', () => {
      const { container } = renderToolbar({ editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('keeps the menu toolbar while editing when hideWhileEditing is false', () => {
      const { container } = renderToolbar({
        editing: true,
        props: { hideWhileEditing: false },
      })

      expect(getToolbars(container)).toHaveLength(1)
    })

    it('hides the menu toolbar when visibleWhen is false', () => {
      const { container } = renderToolbar({ props: { visibleWhen: false } })

      expect(getToolbars(container)).toHaveLength(0)
    })
  })

  describe('default items', () => {
    it('renders edit, separator, and snippet items', () => {
      const { container } = renderToolbar({ cardConfig: { createSnippet: vi.fn() } })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)
      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and the default separator without createSnippet', () => {
      const { container } = renderToolbar()

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('passes the edit item dataTestId through', () => {
      renderToolbar({ props: { items: [{ kind: 'edit', dataTestId: 'edit-test-card' }] } })

      expect(screen.getByTestId('edit-test-card')).toBeTruthy()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', () => {
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderToolbar()

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })
  })

  describe('snippet flow', () => {
    it('swaps the menu toolbar for the snippet input and back', () => {
      const { container } = renderToolbar({ cardConfig: { createSnippet: vi.fn() } })

      fireEvent.click(screen.getByTestId('create-snippet'))

      let toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()

      // closing the input returns to the menu toolbar
      fireEvent.keyDown(screen.getByTestId('snippet-name'), { key: 'Escape' })

      toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeTruthy()
    })
  })

  describe('custom items', () => {
    const addItem: CardToolbarItem = {
      kind: 'custom',
      icon: 'add',
      label: 'Add images',
      dataTestId: 'add-gallery-image',
      onClick: vi.fn(),
    }

    it('renders custom items with their handlers and active state', () => {
      const onClick = vi.fn()
      const { container } = renderToolbar({
        props: {
          items: [
            { kind: 'custom', icon: 'imgWide', label: 'Wide width', isActive: true, onClick },
            { kind: 'separator', hide: false },
            { kind: 'snippet' },
          ],
        },
        cardConfig: { createSnippet: vi.fn() },
      })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const wide = screen.getByRole('button', { name: 'Wide width' })
      expect(wide.getAttribute('data-inkling-active')).toBe('true')

      fireEvent.click(wide)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('hides custom items flagged hide', () => {
      const { container } = renderToolbar({
        props: { items: [{ ...addItem, hide: true }, { kind: 'snippet' }] },
      })

      const toolbar = getToolbars(container)[0]
      expect(screen.queryByTestId('add-gallery-image')).toBeNull()
      expect(toolbar.querySelectorAll('li')).toHaveLength(0)
    })

    it('honors an explicit separator hide over the createSnippet gate', () => {
      const { container } = renderToolbar({
        props: { items: [{ ...addItem }, { kind: 'separator', hide: false }, { kind: 'snippet' }] },
      })

      // no createSnippet configured, but the explicit separator stays
      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(2)
    })
  })
})
