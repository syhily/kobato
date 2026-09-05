import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getNodeByKey, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor, tick } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type FileUploader } from '@/context/InklingHostIntegrationContext'
import { AudioNode, $createAudioNode } from '@/nodes/AudioNode'
import { AudioNodeComponent } from '@/nodes/AudioNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'audio-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

const AUDIO_FILE_TYPES = { audio: { mimeTypes: ['audio/mpeg'] }, image: { mimeTypes: ['image/png'] } }

function addAudioNode(editor: LexicalEditor) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const audioNode = new AudioNode({ src: '/audio.mp3', title: 'Episode 1', duration: 125 })
        $getRoot().append(audioNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function addTriggerAudioNode(editor: LexicalEditor) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const audioNode = $createAudioNode({ triggerFileDialog: true })
        $getRoot().append(audioNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function readTriggerFileDialog(editor: LexicalEditor, nodeKey: NodeKey) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey) as AudioNode | null
    return node?.__triggerFileDialog
  })
}

describe('AudioNodeComponent', () => {
  let editor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: [AudioNode], headless: false })
    mockComposerContext(editor)
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:audio-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  interface RenderOptions {
    src?: string
    triggerFileDialog?: boolean
    initialFile?: File
    upload?: ReturnType<FileUploader['useFileUpload']>['upload']
    isLoading?: boolean
  }

  function renderComponent(nodeKey: NodeKey, options: RenderOptions = {}) {
    const {
      src = '/audio.mp3',
      triggerFileDialog = false,
      initialFile,
      upload = vi.fn(() => Promise.resolve(undefined)),
      isLoading = false,
    } = options
    const composerValue = createHostIntegrationValue({ upload, isLoading, fileTypes: AUDIO_FILE_TYPES })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
    return render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <AudioNodeComponent
            duration={125}
            initialFile={initialFile}
            nodeKey={nodeKey}
            src={src}
            thumbnailSrc=""
            title="Episode 1"
            triggerFileDialog={triggerFileDialog}
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )
  }

  it('renders with typed audio card props', async () => {
    const nodeKey = await addAudioNode(editor)

    renderComponent(nodeKey)

    expect(screen.getByTestId('audio-card-populated')).toBeTruthy()
    expect((screen.getByTestId('audio-title') as HTMLInputElement).value).toBe('Episode 1')
  })

  it('opens the file dialog once when triggerFileDialog is true', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const nodeKey = await addTriggerAudioNode(editor)

    renderComponent(nodeKey, { src: '', triggerFileDialog: true })

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    // the flag is cleared on the node so a re-render does not trigger it again
    await waitFor(() => {
      expect(readTriggerFileDialog(editor, nodeKey)).toBe(false)
    })
  })

  it('uploads the initial file when the card has no src', async () => {
    const nodeKey = await addTriggerAudioNode(editor)
    const upload = vi.fn(() => Promise.resolve(undefined))
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })

    renderComponent(nodeKey, { src: '', initialFile: file, upload })

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith([file])
    })

    // the object URL is leased for metadata and released when the flow ends
    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(file)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:audio-preview')
  })

  it('does not upload the initial file when the card already has a src', async () => {
    const nodeKey = await addAudioNode(editor)
    const upload = vi.fn(() => Promise.resolve(undefined))
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })

    renderComponent(nodeKey, { src: '/audio.mp3', initialFile: file, upload })

    // the mount effect runs synchronously; give any async work a chance to fire
    await tick()
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not upload the initial file while the uploader is loading', async () => {
    const nodeKey = await addTriggerAudioNode(editor)
    const upload = vi.fn(() => Promise.resolve(undefined))
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })

    renderComponent(nodeKey, { src: '', initialFile: file, upload, isLoading: true })

    // the mount effect runs synchronously; give any async work a chance to fire
    await tick()
    expect(upload).not.toHaveBeenCalled()
  })

  describe('action toolbar', () => {
    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      { src = '/audio.mp3', cardConfig = {} } = {},
    ) {
      const composerValue = createHostIntegrationValue({ cardConfig, fileTypes: AUDIO_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <AudioNodeComponent
              duration={125}
              initialFile={undefined}
              nodeKey={nodeKey}
              src={src}
              thumbnailSrc=""
              title="Episode 1"
              triggerFileDialog={false}
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="audio"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar when the card has no src', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { src: '' })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders edit, separator, and snippet items when selected and populated', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      // plan 046 step 3 deliberate change: audio's snippet item read
      // "Snippet" before the migration; it now reads "Save as snippet"
      // like the other ten cards
      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', async () => {
      const nodeKey = await addAudioNode(editor)
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderWithToolbar(nodeKey, { selected: true })

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addAudioNode(editor)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
