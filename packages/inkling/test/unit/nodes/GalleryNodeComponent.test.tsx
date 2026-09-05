import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getNodeByKey, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GalleryImage } from '@/types/gallery'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor } from '#/utils/test-editor'
import {
  InklingHostIntegrationProvider,
  type CardConfig,
  type FileUploader,
} from '@/context/InklingHostIntegrationContext'
import { $isGalleryNode } from '@/nodes/base'
import { GalleryNode } from '@/nodes/GalleryNode'
import { GalleryNodeComponent } from '@/nodes/GalleryNodeComponent'
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
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey,
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

const IMAGE_FILE_TYPES = { image: { mimeTypes: ['image/png'] } }

function addGalleryNode(
  editor: LexicalEditor,
  images: GalleryImage[] = [
    { src: '/one.png', fileName: 'one.png', width: 100, height: 100 },
    { src: '/two.png', fileName: 'two.png', width: 100, height: 100 },
  ],
) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const galleryNode = new GalleryNode({
          images,
        })
        $getRoot().append(galleryNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

describe('GalleryNodeComponent', () => {
  let editor: LexicalEditor
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
  let previewCount: number

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: [GalleryNode], headless: false })
    mockComposerContext(editor)
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 100 })
    previewCount = 0
    vi.spyOn(globalThis.URL, 'createObjectURL').mockImplementation(() => {
      previewCount += 1
      return `blob:gallery-preview-${previewCount}`
    })
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderComponent(nodeKey: NodeKey, upload?: ReturnType<FileUploader['useFileUpload']>['upload']) {
    const composerValue = createHostIntegrationValue({ upload, fileTypes: IMAGE_FILE_TYPES })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
    return render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <GalleryNodeComponent
            captionEditor={createTestEditor({ nodes: [GalleryNode], headless: false })}
            captionEditorInitialState={undefined}
            nodeKey={nodeKey}
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )
  }

  function readNodeImages(nodeKey: NodeKey): GalleryImage[] {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as GalleryNode | null
      return node ? (node.images as GalleryImage[]) : []
    })
  }

  function changeFileInput(files: File[]) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files } })
  }

  it('renders with the unified GalleryImage type', async () => {
    const nodeKey = await addGalleryNode(editor)

    renderComponent(nodeKey)

    expect(screen.getAllByTestId('gallery-image')).toHaveLength(2)
  })

  it('adapts onChange to the file input', async () => {
    const nodeKey = await addGalleryNode(editor)

    renderComponent(nodeKey)

    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('caps uploads at 9 images and shows the limit message', async () => {
    const nodeKey = await addGalleryNode(editor)
    const upload = vi.fn().mockResolvedValue([])
    renderComponent(nodeKey, upload)

    const files = Array.from({ length: 8 }, (_, i) => new File(['x'], `extra-${i}.png`, { type: 'image/png' }))
    changeFileInput(files)

    await waitFor(() => {
      expect(screen.getByTestId('gallery-error')).toHaveTextContent('Galleries are limited to 9 images')
    })

    // only the 7 files that fit under the cap are uploaded
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][0]).toHaveLength(7)
  })

  it('matches upload results to previews by fileName and revokes the previews on success', async () => {
    const nodeKey = await addGalleryNode(editor)
    const upload = vi.fn().mockResolvedValue([
      { url: 'https://cdn.example.com/b.png', fileName: 'b.png' },
      { url: 'https://cdn.example.com/a.png', fileName: 'a.png' },
    ])
    renderComponent(nodeKey, upload)

    changeFileInput([new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })])

    await waitFor(() => {
      expect(readNodeImages(nodeKey)).toHaveLength(4)
    })

    const images = readNodeImages(nodeKey)
    expect(images[2]).toMatchObject({ fileName: 'a.png', src: 'https://cdn.example.com/a.png' })
    expect(images[3]).toMatchObject({ fileName: 'b.png', src: 'https://cdn.example.com/b.png' })
    expect(images[2].previewSrc).toBeUndefined()
    expect(images[3].previewSrc).toBeUndefined()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-1')
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-2')
  })

  it('strips and revokes the previews, writes the cleaned images, and shows the error on upload failure', async () => {
    const nodeKey = await addGalleryNode(editor)
    const upload = vi.fn().mockResolvedValue(undefined)
    renderComponent(nodeKey, upload)

    changeFileInput([new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })])

    await waitFor(() => {
      expect(screen.getByTestId('gallery-error')).toHaveTextContent(
        'Something went wrong while uploading images. Please refresh the page and try again',
      )
    })

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-1')
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-2')

    // the node is written with the new images kept but their previews stripped
    const images = readNodeImages(nodeKey)
    expect(images).toHaveLength(4)
    expect(images[2]).toMatchObject({ fileName: 'a.png', width: 100, height: 100 })
    expect(images[2].src).toBeUndefined()
    expect(images[2].previewSrc).toBeUndefined()
    expect(images[3].fileName).toBe('b.png')
  })

  it('resyncs the rendered images when the node changes while the card stays mounted', async () => {
    const nodeKey = await addGalleryNode(editor)
    renderComponent(nodeKey)

    expect(screen.getAllByTestId('gallery-image')).toHaveLength(2)

    // an external change to node.images (undo of a within-card delete, collab)
    // must be reflected without a remount
    await act(async () => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isGalleryNode(node)) {
          node.setImages([{ src: '/three.png', fileName: 'three.png', width: 100, height: 100 }])
        }
      })
    })

    expect(screen.getAllByTestId('gallery-image')).toHaveLength(1)
    expect(screen.getByTestId('gallery-image').querySelector('img')).toHaveAttribute('src', '/three.png')
  })

  it('writes back the resynced list after an external node change (no stale write-back)', async () => {
    const nodeKey = await addGalleryNode(editor)
    renderComponent(nodeKey)

    await act(async () => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isGalleryNode(node)) {
          node.setImages([{ src: '/two.png', fileName: 'two.png', width: 100, height: 100 }])
        }
      })
    })
    expect(screen.getAllByTestId('gallery-image')).toHaveLength(1)

    // deleting from the resynced list must not resurrect the stale images
    fireEvent.click(screen.getByTestId('delete-image'))
    await act(async () => {})

    expect(readNodeImages(nodeKey)).toHaveLength(0)
  })

  it('revokes all tracked previews on unmount', async () => {
    const nodeKey = await addGalleryNode(editor)
    // an upload that never resolves leaves the previews tracked at unmount time
    const upload = vi.fn(() => new Promise<undefined>(() => {}))
    const { unmount } = renderComponent(nodeKey, upload)

    changeFileInput([new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })])

    await waitFor(() => {
      expect(screen.getAllByTestId('gallery-image')).toHaveLength(4)
    })
    expect(revokeObjectURLSpy).not.toHaveBeenCalled()

    unmount()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-1')
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:gallery-preview-2')
  })

  describe('action toolbar', () => {
    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      cardConfig: CardConfig = {},
    ) {
      const composerValue = createHostIntegrationValue({ cardConfig, fileTypes: IMAGE_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <GalleryNodeComponent
              captionEditor={createTestEditor({ nodes: [GalleryNode], headless: false })}
              captionEditorInitialState={undefined}
              nodeKey={nodeKey}
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="gallery"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('keeps the toolbar visible while the card is editing', async () => {
      // gallery's menu toolbar has no !isEditing factor
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(1)
    })

    it('hides the toolbar when the gallery has no images', async () => {
      const nodeKey = await addGalleryNode(editor, [])
      const { container } = renderWithToolbar(nodeKey)

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while files are dragged over the card', async () => {
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey)

      expect(getToolbars(container)).toHaveLength(1)

      fireEvent.dragEnter(screen.getByTestId('gallery-container'))
      expect(getToolbars(container)).toHaveLength(0)

      fireEvent.dragLeave(screen.getByTestId('gallery-container'))
      expect(getToolbars(container)).toHaveLength(1)
    })

    it('renders add-images, separator, and snippet items when selected', async () => {
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey, {}, { createSnippet: vi.fn() })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Add images', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('add-gallery-image')).toBeTruthy()
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey)

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.getByTestId('add-gallery-image')).toBeTruthy()
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('clicks the hidden file input when the add-images item is clicked', async () => {
      const nodeKey = await addGalleryNode(editor)
      renderWithToolbar(nodeKey)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click')
      fireEvent.click(screen.getByTestId('add-gallery-image'))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('opens the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addGalleryNode(editor)
      const { container } = renderWithToolbar(nodeKey, {}, { createSnippet: vi.fn() })

      fireEvent.click(screen.getByTestId('create-snippet'))

      // the menu toolbar unmounts while the snippet input is open (plan 046)
      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
