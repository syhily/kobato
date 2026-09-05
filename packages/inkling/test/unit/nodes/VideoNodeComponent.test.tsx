import { CollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { $getNodeByKey, $getRoot, createEditor, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { tick, updateEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider, type FileUploader } from '@/context/InklingHostIntegrationContext'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import { VideoNode, $createVideoNode } from '@/nodes/VideoNode'
import { VideoNodeComponent } from '@/nodes/VideoNodeComponent'
import { EDIT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import extractVideoMetadata from '@/utils/extractVideoMetadata'

vi.mock('@/utils/extractVideoMetadata', () => ({
  default: vi.fn(),
}))

function createTestEditor(): LexicalEditor {
  const editor = createEditor({ namespace: 'test', nodes: [VideoNode], onError: () => {} })
  const rootElement = document.createElement('div')
  editor.setRootElement(rootElement)
  return editor
}

// the store equivalent of the old per-test CardContext factory: the card is
// selected and editing unless a test says otherwise
function createSelection(
  nodeKey: NodeKey = 'video-1',
  { selected = true, editing = true }: { selected?: boolean; editing?: boolean } = {},
) {
  return createCardSelectionStoreWrapper({
    initialState: { selectedCardKey: selected ? nodeKey : null, isEditingCard: editing },
  })
}

function createCollaborationContext() {
  return { color: '#000000', isCollabActive: false, name: 'test', yjsDocMap: new Map() }
}

function createLexicalComposerContext(editor: LexicalEditor): [LexicalEditor, { getTheme: () => undefined }] {
  return [editor, { getTheme: () => undefined }]
}

type UploadFunction = ReturnType<FileUploader['useFileUpload']>['upload']
type UploadMock = Omit<ReturnType<FileUploader['useFileUpload']>, 'upload'> & {
  isLoading: boolean
  upload: MockedFunction<UploadFunction>
  errors: Error[]
}

function createUploadMock(overrides: Partial<UploadMock> = {}): UploadMock {
  return {
    isLoading: false,
    upload: vi.fn(() => Promise.resolve(undefined)),
    errors: [],
    ...overrides,
  }
}

const VIDEO_FILE_TYPES = { image: { mimeTypes: ['image/png'] }, video: { mimeTypes: ['video/mp4'] } }

function addVideoNode(editor: LexicalEditor, loop: boolean) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const videoNode = $createVideoNode({
          src: 'https://example.com/video.mp4',
          thumbnailSrc: 'https://example.com/thumb.jpg',
          loop,
        })
        $getRoot().append(videoNode)
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function readLoop(editor: LexicalEditor, nodeKey: NodeKey) {
  return editor.getEditorState().read(() => ($getNodeByKey(nodeKey) as VideoNode | null)?.loop)
}

function readVideoFields(editor: LexicalEditor, nodeKey: NodeKey) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey) as VideoNode | null
    if (!node) {
      return null
    }
    return {
      src: node.src,
      duration: node.duration,
      fileName: node.fileName,
      width: node.width,
      height: node.height,
      mimeType: node.mimeType,
      thumbnailSrc: node.thumbnailSrc,
      thumbnailWidth: node.thumbnailWidth,
      thumbnailHeight: node.thumbnailHeight,
      customThumbnailSrc: node.customThumbnailSrc,
      triggerFileDialog: node.__triggerFileDialog,
    }
  })
}

describe('VideoNodeComponent', () => {
  let editor: LexicalEditor
  let captionEditor: LexicalEditor
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor()
    captionEditor = createEditor({ namespace: 'caption', nodes: MINIMAL_NODES, onError: () => {} })
    vi.mocked(extractVideoMetadata).mockResolvedValue({
      duration: 61,
      width: 640,
      height: 360,
      mimeType: 'video/mp4',
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
    })
    createObjectURLSpy = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:video-thumb-preview')
    revokeObjectURLSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  interface RenderOptions {
    initialFile?: File
    thumbnail?: string
    customThumbnail?: string
    triggerFileDialog?: boolean
    uploads?: Record<string, UploadMock>
  }

  function renderComponent(nodeKey: NodeKey, isLoopChecked: boolean, options: RenderOptions = {}) {
    const {
      initialFile,
      thumbnail = 'https://example.com/thumb.jpg',
      customThumbnail = '',
      triggerFileDialog = false,
      uploads = {},
    } = options
    const collaborationValue = createCollaborationContext()
    const composerValue = createLexicalComposerContext(editor)
    const inklingComposerValue = createHostIntegrationValue({ uploads, fileTypes: VIDEO_FILE_TYPES })
    const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey)

    return render(
      <CollaborationContext.Provider value={collaborationValue}>
        <LexicalComposerContext.Provider value={composerValue}>
          <InklingHostIntegrationProvider value={inklingComposerValue}>
            <CardSelectionStoreProvider>
              <VideoNodeComponent
                captionEditor={captionEditor}
                captionEditorInitialState={undefined}
                cardWidth="regular"
                customThumbnail={customThumbnail}
                initialFile={initialFile}
                isLoopChecked={isLoopChecked}
                nodeKey={nodeKey}
                thumbnail={thumbnail}
                totalDuration="1:23"
                triggerFileDialog={triggerFileDialog}
              />
            </CardSelectionStoreProvider>
          </InklingHostIntegrationProvider>
        </LexicalComposerContext.Provider>
      </CollaborationContext.Provider>,
    )
  }

  it('disables loop on the node when the loop toggle is switched off', async () => {
    const nodeKey = await addVideoNode(editor, true)

    renderComponent(nodeKey, true)
    fireEvent.click(screen.getByTestId('loop-video'))

    await waitFor(() => {
      expect(readLoop(editor, nodeKey)).toBe(false)
    })
  })

  it('enables loop on the node when the loop toggle is switched on', async () => {
    const nodeKey = await addVideoNode(editor, false)

    renderComponent(nodeKey, false)
    fireEvent.click(screen.getByTestId('loop-video'))

    await waitFor(() => {
      expect(readLoop(editor, nodeKey)).toBe(true)
    })
  })

  it('surfaces the exact metadata error and writes nothing when metadata extraction fails', async () => {
    const nodeKey = await addVideoNode(editor, false)
    vi.mocked(extractVideoMetadata).mockRejectedValue(new Error('Failed to load video metadata'))
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock()

    renderComponent(nodeKey, false, { initialFile: file, thumbnail: '', uploads: { video: videoUpload } })

    await waitFor(() => {
      expect(screen.getByTestId('media-placeholder-errors')).toHaveTextContent(
        'The file type you uploaded is not supported. Please use .VIDEO/MP4',
      )
    })

    expect(videoUpload.upload).not.toHaveBeenCalled()
    expect(readVideoFields(editor, nodeKey)).toMatchObject({
      src: 'https://example.com/video.mp4',
      thumbnailSrc: 'https://example.com/thumb.jpg',
      fileName: '',
      duration: 0,
    })
  })

  it('writes the full patch, uploads a synthesized thumbnail, and clears the preview', async () => {
    const nodeKey = await addVideoNode(editor, false)
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' })
    vi.mocked(extractVideoMetadata).mockResolvedValue({
      duration: 61,
      width: 640,
      height: 360,
      mimeType: 'video/mp4',
      thumbnailBlob,
    })
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock({
      upload: vi.fn().mockResolvedValue([{ url: 'https://cdn.example.com/clip.mp4' }]),
    })
    const thumbnailUpload = createUploadMock({
      upload: vi.fn().mockResolvedValue([{ url: 'https://cdn.example.com/clip.mp4.jpg' }]),
    })

    renderComponent(nodeKey, false, {
      initialFile: file,
      uploads: { video: videoUpload, mediaThumbnail: thumbnailUpload },
    })

    await waitFor(() => {
      expect(readVideoFields(editor, nodeKey)?.src).toBe('https://cdn.example.com/clip.mp4')
    })

    // full patch, with thumbnail dimensions backfilled because no custom thumbnail is set
    expect(readVideoFields(editor, nodeKey)).toMatchObject({
      src: 'https://cdn.example.com/clip.mp4',
      duration: 61,
      fileName: 'clip.mp4',
      width: 640,
      height: 360,
      mimeType: 'video/mp4',
      thumbnailWidth: 640,
      thumbnailHeight: 360,
      thumbnailSrc: 'https://cdn.example.com/clip.mp4.jpg',
    })

    // thumbnail sub-flow: a synthesized jpg File through the mediaThumbnail uploader
    expect(thumbnailUpload.upload).toHaveBeenCalledTimes(1)
    const [thumbnailFiles, thumbnailOptions] = thumbnailUpload.upload.mock.calls[0]
    expect(thumbnailFiles).toHaveLength(1)
    expect(thumbnailFiles[0]).toBeInstanceOf(File)
    expect(thumbnailFiles[0].name).toBe('clip.mp4.jpg')
    expect(thumbnailFiles[0].type).toBe('image/jpeg')
    expect(thumbnailOptions).toEqual({ formData: { url: 'https://cdn.example.com/clip.mp4' } })

    // the preview thumbnail is leased for the extracted blob, then released when the flow completes
    expect(createObjectURLSpy).toHaveBeenCalledExactlyOnceWith(thumbnailBlob)
    expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:video-thumb-preview')
  })

  it('keeps custom thumbnail dimensions when a custom thumbnail is set', async () => {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const videoNode = $createVideoNode({
        src: 'https://example.com/video.mp4',
        thumbnailSrc: 'https://example.com/thumb.jpg',
        customThumbnailSrc: 'https://example.com/custom.jpg',
        thumbnailWidth: 111,
        thumbnailHeight: 55,
      })
      $getRoot().append(videoNode)
      nodeKey = videoNode.getKey()
    })

    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock({
      upload: vi.fn().mockResolvedValue([{ url: 'https://cdn.example.com/clip.mp4' }]),
    })
    const thumbnailUpload = createUploadMock({
      upload: vi.fn().mockResolvedValue([{ url: 'https://cdn.example.com/clip.mp4.jpg' }]),
    })

    renderComponent(nodeKey, false, {
      initialFile: file,
      customThumbnail: 'https://example.com/custom.jpg',
      uploads: { video: videoUpload, mediaThumbnail: thumbnailUpload },
    })

    await waitFor(() => {
      expect(readVideoFields(editor, nodeKey)?.src).toBe('https://cdn.example.com/clip.mp4')
    })

    // thumbnail dimensions are left to the custom thumbnail; the uploaded
    // thumbnail still lands on thumbnailSrc
    expect(readVideoFields(editor, nodeKey)).toMatchObject({
      thumbnailWidth: 111,
      thumbnailHeight: 55,
      thumbnailSrc: 'https://cdn.example.com/clip.mp4.jpg',
    })
  })

  it('clears the preview and leaves the node untouched when the upload returns no url', async () => {
    const nodeKey = await addVideoNode(editor, false)
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock({ upload: vi.fn().mockResolvedValue([{}]) })
    const thumbnailUpload = createUploadMock()

    renderComponent(nodeKey, false, {
      initialFile: file,
      uploads: { video: videoUpload, mediaThumbnail: thumbnailUpload },
    })

    await waitFor(() => {
      expect(revokeObjectURLSpy).toHaveBeenCalledExactlyOnceWith('blob:video-thumb-preview')
    })

    expect(readVideoFields(editor, nodeKey)).toMatchObject({
      src: 'https://example.com/video.mp4',
      thumbnailSrc: 'https://example.com/thumb.jpg',
      fileName: '',
      duration: 0,
    })
    expect(thumbnailUpload.upload).not.toHaveBeenCalled()
  })

  it('opens the file dialog once when triggerFileDialog is true', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    let nodeKey = ''
    await updateEditor(editor, () => {
      const videoNode = $createVideoNode({ triggerFileDialog: true })
      $getRoot().append(videoNode)
      nodeKey = videoNode.getKey()
    })

    renderComponent(nodeKey, false, { triggerFileDialog: true, thumbnail: '' })

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    // the flag is cleared on the node so a re-render does not trigger it again
    await waitFor(() => {
      expect(readVideoFields(editor, nodeKey)?.triggerFileDialog).toBe(false)
    })
  })

  it('uploads the initial file even when the card already has a src', async () => {
    const nodeKey = await addVideoNode(editor, false)
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock()

    renderComponent(nodeKey, false, { initialFile: file, uploads: { video: videoUpload } })

    await waitFor(() => {
      expect(videoUpload.upload).toHaveBeenCalledWith([file])
    })
  })

  it('does not upload the initial file while the uploader is loading', async () => {
    const nodeKey = await addVideoNode(editor, false)
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const videoUpload = createUploadMock({ isLoading: true })

    renderComponent(nodeKey, false, { initialFile: file, uploads: { video: videoUpload } })

    // the mount effect runs synchronously; give any async work a chance to fire
    await tick()
    expect(videoUpload.upload).not.toHaveBeenCalled()
    expect(extractVideoMetadata).not.toHaveBeenCalled()
  })

  describe('action toolbar', () => {
    function renderWithToolbar(
      nodeKey: NodeKey,
      selection: { selected?: boolean; editing?: boolean } = {},
      { thumbnail = 'https://example.com/thumb.jpg', customThumbnail = '', cardConfig = {} } = {},
    ) {
      const collaborationValue = createCollaborationContext()
      const composerValue = createLexicalComposerContext(editor)
      const inklingComposerValue = createHostIntegrationValue({ cardConfig, fileTypes: VIDEO_FILE_TYPES })
      const { wrapper: CardSelectionStoreProvider } = createSelection(nodeKey, { editing: false, ...selection })

      return render(
        <CollaborationContext.Provider value={collaborationValue}>
          <LexicalComposerContext.Provider value={composerValue}>
            <InklingHostIntegrationProvider value={inklingComposerValue}>
              <CardSelectionStoreProvider>
                <VideoNodeComponent
                  captionEditor={captionEditor}
                  captionEditorInitialState={undefined}
                  cardWidth="regular"
                  customThumbnail={customThumbnail}
                  initialFile={undefined}
                  isLoopChecked={false}
                  nodeKey={nodeKey}
                  thumbnail={thumbnail}
                  totalDuration="1:23"
                  triggerFileDialog={false}
                />
              </CardSelectionStoreProvider>
            </InklingHostIntegrationProvider>
          </LexicalComposerContext.Provider>
        </CollaborationContext.Provider>,
      )
    }

    function getToolbars(container: HTMLElement) {
      return container.querySelectorAll('[data-inkling-card-toolbar="video"]')
    }

    it('hides the toolbar when the card is not selected', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: false })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar while the card is editing', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: true, editing: true })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('hides the toolbar when the card has no thumbnail', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { thumbnail: '' })

      expect(getToolbars(container)).toHaveLength(0)
    })

    it('shows the toolbar when only a custom thumbnail is set', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(
        nodeKey,
        { selected: true },
        { thumbnail: '', customThumbnail: 'https://example.com/custom.jpg' },
      )

      expect(getToolbars(container)).toHaveLength(1)
    })

    it('renders edit, separator, and snippet items when selected and populated', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      const toolbar = toolbars[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(3)

      const labels = Array.from(toolbar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['Edit', 'Save as snippet'])
      expect(toolbar.querySelectorAll('button svg')).toHaveLength(2)
      expect(screen.getByTestId('edit-video-card')).toBeTruthy()
      expect(screen.getByTestId('create-snippet')).toBeTruthy()
    })

    it('hides the snippet item and its separator when createSnippet is not configured', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: true })

      const toolbar = getToolbars(container)[0]
      expect(toolbar.querySelectorAll('li')).toHaveLength(1)
      expect(screen.getByTestId('edit-video-card')).toBeTruthy()
      expect(screen.queryByTestId('create-snippet')).toBeNull()
    })

    it('dispatches EDIT_CARD_COMMAND for the card when the edit item is clicked', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderWithToolbar(nodeKey, { selected: true })

      fireEvent.click(screen.getByTestId('edit-video-card'))

      expect(dispatchSpy).toHaveBeenCalledWith(EDIT_CARD_COMMAND, { cardKey: nodeKey })
    })

    it('swaps the menu toolbar for the snippet input when the snippet item is clicked', async () => {
      const nodeKey = await addVideoNode(editor, false)
      const { container } = renderWithToolbar(nodeKey, { selected: true }, { cardConfig: { createSnippet: vi.fn() } })

      fireEvent.click(screen.getByTestId('create-snippet'))

      const toolbars = getToolbars(container)
      expect(toolbars).toHaveLength(1)
      expect(toolbars[0].querySelector('ul')).toBeNull()
      expect(toolbars[0].querySelector('[data-testid="snippet-name"]')).toBeTruthy()
    })
  })
})
