import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getNodeByKey, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { createTestEditor, tick } from '#/utils/test-editor'
import {
  InklingHostIntegrationProvider,
  type CardConfig,
  type FileUploader,
} from '@/context/InklingHostIntegrationContext'
import { FileNode, $createFileNode } from '@/nodes/FileNode'
import FileNodeComponent from '@/nodes/FileNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

// the store equivalent of the old per-test CardContext factory: the card is
// selected and not editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'file-1',
  { selected = true, editing = false }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

const FILE_FILE_TYPES = { file: { mimeTypes: ['application/pdf'] } }

function addFileNode(editor: LexicalEditor, dataset: { src?: string; triggerFileDialog?: boolean } = {}) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const fileNode = $createFileNode(dataset)
        $getRoot().append(fileNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function readTriggerFileDialog(editor: LexicalEditor, nodeKey: NodeKey) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey) as FileNode | null
    return node?.__triggerFileDialog
  })
}

describe('FileNodeComponent', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createTestEditor({ nodes: [FileNode], headless: false })
    mockComposerContext(editor)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  interface RenderOptions {
    fileSrc?: string
    triggerFileDialog?: boolean
    initialFile?: File
    upload?: ReturnType<FileUploader['useFileUpload']>['upload']
  }

  function renderComponent(nodeKey: NodeKey, options: RenderOptions = {}) {
    const { fileSrc = '', triggerFileDialog = false, initialFile, upload } = options
    const composerValue = createHostIntegrationValue({ upload, fileTypes: FILE_FILE_TYPES })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)
    return render(
      <InklingHostIntegrationProvider value={composerValue}>
        <CardSelectionStoreProvider>
          <FileNodeComponent
            fileDesc=""
            fileDescPlaceholder="Add a description"
            fileName=""
            fileSize=""
            fileSrc={fileSrc}
            fileTitle=""
            fileTitlePlaceholder="Add a title"
            initialFile={initialFile}
            nodeKey={nodeKey}
            triggerFileDialog={triggerFileDialog}
          />
        </CardSelectionStoreProvider>
      </InklingHostIntegrationProvider>,
    )
  }

  it('renders the empty card when no file is set', async () => {
    const nodeKey = await addFileNode(editor)

    renderComponent(nodeKey)

    expect(screen.getByTestId('media-placeholder')).toBeTruthy()
  })

  it('opens the file dialog once when triggerFileDialog is true', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const nodeKey = await addFileNode(editor, { triggerFileDialog: true })

    renderComponent(nodeKey, { triggerFileDialog: true })

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    // the flag is cleared on the node so a re-render does not trigger it again
    await waitFor(() => {
      expect(readTriggerFileDialog(editor, nodeKey)).toBe(false)
    })
  })

  it('uploads the initial file when the card has no src', async () => {
    const nodeKey = await addFileNode(editor)
    const upload = vi.fn(() => Promise.resolve(undefined))
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    renderComponent(nodeKey, { initialFile: file, upload })

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith([file])
    })
  })

  it('does not upload the initial file when the card already has a src', async () => {
    const nodeKey = await addFileNode(editor, { src: '/existing.pdf' })
    const upload = vi.fn(() => Promise.resolve(undefined))
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    renderComponent(nodeKey, { fileSrc: '/existing.pdf', initialFile: file, upload })

    // the mount effect runs synchronously; give any async work a chance to fire
    await tick()
    expect(upload).not.toHaveBeenCalled()
  })

  describe('action toolbar', () => {
    const populatedProps = {
      fileName: 'report.pdf',
      fileSize: '12 KB',
      fileSrc: '/report.pdf',
    }

    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      { populated = true, cardConfig = {} }: { populated?: boolean; cardConfig?: CardConfig } = {},
    ) {
      const composerValue = createHostIntegrationValue({ cardConfig, fileTypes: FILE_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, selection)
      const fileProps = populated ? populatedProps : { fileName: '', fileSize: '', fileSrc: '' }
      return render(
        <InklingHostIntegrationProvider value={composerValue}>
          <CardSelectionStoreProvider>
            <FileNodeComponent
              fileDesc=""
              fileDescPlaceholder="Add a description"
              fileName={fileProps.fileName}
              fileSize={fileProps.fileSize}
              fileSrc={fileProps.fileSrc}
              fileTitle="Report"
              fileTitlePlaceholder="Add a title"
              nodeKey={nodeKey}
              triggerFileDialog={false}
            />
          </CardSelectionStoreProvider>
        </InklingHostIntegrationProvider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="file-upload"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar until the card is populated', async () => {
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { populated: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('renders edit, separator, and snippet items when selected and populated', async () => {
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(
        nodeKey,
        { selected: true },
        {
          cardConfig: { createSnippet: vi.fn() },
        },
      )

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('edit-file-upload-card')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      // plan 046 step 4 deliberate change: file was the only card that did
      // not gate the snippet item (or its separator) on
      // cardConfig.createSnippet — the item opened an input whose creation
      // silently no-oped. It now matches the other ten cards
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.queryByRole('button', { name: 'Save as snippet' })).toBeNull()
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', async () => {
      // plan 046 step 4 deliberate change: file's edit item was wired to an
      // inert no-op (preventDefault/stopPropagation only); it now enters the
      // edit mode FileCard already implements, like every other card
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      renderWithToolbar(nodeKey, { selected: true })
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')

      fireEvent.click(screen.getByTestId('edit-file-upload-card'))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addFileNode(editor, { src: '/report.pdf' })
      const { container } = renderWithToolbar(
        nodeKey,
        { selected: true },
        {
          cardConfig: { createSnippet: vi.fn() },
        },
      )

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
