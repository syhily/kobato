import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor, tick } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type CardConfig } from '@/context/InklingHostIntegrationContext'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { ImageNodeComponent } from '@/nodes/ImageNodeComponent'
import { getImageDimensions } from '@/utils/getImageDimensions'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

vi.mock('@/utils/getImageDimensions', () => ({
  getImageDimensions: vi.fn(),
}))

vi.mock('../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => null,
}))

// the store equivalent of the old per-test CardContext factory: the card is
// selected (its toolbar renders) and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'img-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

describe('ImageNodeComponent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: [ImageNode], headless: false })
    mockComposerContext(editor)
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 200 })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:image-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders with typed refs when fileTypes is empty', () => {
    const composerValue = createHostIntegrationValue()
    const { wrapper: CardSelectionStoreProvider } = createSelection()
    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ImageNodeComponent cardWidth="regular" nodeKey="img-1" src="/image.png" />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    expect(screen.getByTestId('image-card-populated')).toBeTruthy()
  })

  it('renders when image mimeTypes are provided', () => {
    const composerValue = createHostIntegrationValue({
      fileTypes: { image: { mimeTypes: ['image/png', 'image/jpeg'] } },
    })
    const { wrapper: CardSelectionStoreProvider } = createSelection()
    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ImageNodeComponent cardWidth="regular" nodeKey="img-1" src="/image.png" altText="Alt text" />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    expect(screen.getByTestId('image-card-populated')).toBeTruthy()
  })

  it('opens the file dialog once when triggerFileDialog is true', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const composerValue = createHostIntegrationValue({ fileTypes: { image: { mimeTypes: ['image/png'] } } })
    const { wrapper: CardSelectionStoreProvider } = createSelection()
    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          {/* the insert flow: no src yet, so the empty card's hidden file input exists to click */}
          <ImageNodeComponent cardWidth="regular" nodeKey="img-1" src="" triggerFileDialog />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
  })

  it('uploads the initial file when the card has no src', async () => {
    const upload = vi.fn(() => Promise.resolve(undefined))
    const composerValue = createHostIntegrationValue({ fileTypes: { image: { mimeTypes: ['image/png'] } }, upload })
    const { wrapper: CardSelectionStoreProvider } = createSelection()
    const file = new File(['image'], 'photo.png', { type: 'image/png' })

    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ImageNodeComponent cardWidth="regular" nodeKey="img-1" src="" initialFile={file} />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    await waitFor(() => expect(upload).toHaveBeenCalledWith([file]))

    // the preview object URL is leased, then released when the flow ends
    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:image-preview')
  })

  it('does not upload the initial file when the card already has a src', async () => {
    const upload = vi.fn(() => Promise.resolve(undefined))
    const composerValue = createHostIntegrationValue({ fileTypes: { image: { mimeTypes: ['image/png'] } }, upload })
    const { wrapper: CardSelectionStoreProvider } = createSelection()
    const file = new File(['image'], 'photo.png', { type: 'image/png' })

    render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <ImageNodeComponent cardWidth="regular" nodeKey="img-1" src="/image.png" initialFile={file} />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )

    // the mount effect runs synchronously; give any async work a chance to fire
    await tick()
    expect(upload).not.toHaveBeenCalled()
  })

  describe('action toolbar', () => {
    function addImageNode(editor: LexicalEditor, dataset: { src?: string } = { src: '/image.png' }) {
      return new Promise<NodeKey>((resolve) => {
        editor.update(
          () => {
            const imageNode = $createImageNode(dataset)
            $getRoot().append(imageNode)
          },
          { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
        )
      })
    }

    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      { src = '/image.png', href, cardConfig = {} }: { src?: string; href?: string; cardConfig?: CardConfig } = {},
    ) {
      const composerValue = createHostIntegrationValue({
        fileTypes: { image: { mimeTypes: ['image/png'] } },
        cardConfig,
      })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <ImageNodeComponent cardWidth="regular" href={href} nodeKey={nodeKey} src={src} />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="image"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar when the card has no src', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { src: '' })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('keeps the toolbar visible while the card is editing', async () => {
      // image's menu toolbar has no !isEditing factor — unlike the other
      // edit-mode cards it stays up while editing
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(1)
    })

    it('renders width, link, and snippet items in the menu toolbar', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]

      expect(toolbar.querySelectorAll('li')).toHaveLength(7)
      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Regular width', 'Wide width', 'Full width', 'Link', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(5)

      const activeByLabel = Array.from(toolbar.querySelectorAll('button')).map((button) => [
        button.getAttribute('aria-label'),
        button.getAttribute('data-inkling-active'),
      ])
      expect(activeByLabel).toEqual([
        ['Regular width', 'true'],
        ['Wide width', 'false'],
        ['Full width', 'false'],
        ['Link', 'false'],
        ['Save as snippet', 'false'],
      ])
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('marks the link item active when the image has an href', async () => {
      const nodeKey = await addImageNode(editor)
      renderWithToolbar(nodeKey, { selected: true }, { href: 'https://example.com' })

      expect(screen.getByRole('button', { name: 'Link' }).getAttribute('data-inkling-active')).toBe('true')
    })

    it('hides the width items and their separator for gif images', async () => {
      const nodeKey = await addImageNode(editor, { src: '/image.gif' })
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { src: '/image.gif' })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Link'])
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(5)
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('swaps the menu toolbar for the link input when the link item is clicked', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      fireEvent.click(screen.getByRole('button', { name: 'Link' }))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="link-input"]')).toBeTruthy()
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addImageNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
