import type { Klass, LexicalCommand, LexicalEditor, LexicalNode } from 'lexical'

import { renderHook } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, COMMAND_PRIORITY_CRITICAL } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpenCardInEditModePayload } from '@/plugins/behaviour/types'

import { mockComposerContext } from '#/utils/composer-context'
import { createTestEditor, tick, updateEditor } from '#/utils/test-editor'
import { AudioNode, INSERT_AUDIO_COMMAND } from '@/nodes/AudioNode'
import { BookmarkNode, INSERT_BOOKMARK_COMMAND } from '@/nodes/BookmarkNode'
import { ButtonNode, INSERT_BUTTON_COMMAND } from '@/nodes/ButtonNode'
import { CalloutNode, INSERT_CALLOUT_COMMAND } from '@/nodes/CalloutNode'
import { FileNode, INSERT_FILE_COMMAND } from '@/nodes/FileNode'
import { GalleryNode, INSERT_GALLERY_COMMAND } from '@/nodes/GalleryNode'
import { HeaderNode, INSERT_HEADER_COMMAND } from '@/nodes/HeaderNode'
import { HtmlNode, INSERT_HTML_COMMAND } from '@/nodes/HtmlNode'
import { ImageNode, INSERT_IMAGE_COMMAND } from '@/nodes/ImageNode'
import { ToggleNode, INSERT_TOGGLE_COMMAND } from '@/nodes/ToggleNode'
import { VideoNode, INSERT_VIDEO_COMMAND } from '@/nodes/VideoNode'
import { INSERT_MEDIA_COMMAND } from '@/plugins/behaviour/clipboard-protocol'
/**
 * The card insert registration matrix against the Step-2 registrar (plan
 * 043) — the same scenarios and expectations as the Step-1 characterization
 * pins (`CardInsertMatrix.test.ts`), mounted on `CardInsertPlugin` instead
 * of the eleven per-card plugins. Both suites green simultaneously is the
 * zero-drift proof; the header churn case flips here: the registrar's single
 * effect registers once per mount.
 */
import { INSERT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { CardInsertPlugin } from '@/plugins/CardInsertPlugin'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

async function mountRegistrar(editor: LexicalEditor) {
  mockComposerContext(editor)
  renderHook(() => CardInsertPlugin())
  // allow React effects to register commands
  await tick()
}

/** Registers an INSERT_CARD_COMMAND capture listener; returns the captured
 * payload ref and the unregister function. */
function captureInsertCard(editor: LexicalEditor) {
  const ref: { payload: OpenCardInEditModePayload | undefined } = { payload: undefined }
  const removeListener = editor.registerCommand(
    INSERT_CARD_COMMAND,
    (payload) => {
      ref.payload = payload
      return false
    },
    COMMAND_PRIORITY_CRITICAL,
  )
  return { ref, removeListener }
}

interface MatrixRow {
  card: string
  node: Klass<LexicalNode>
  command: LexicalCommand<unknown>
  dataset: unknown
  openInEditMode: boolean
  requiresRangeSelection?: boolean
}

const INSERT_MATRIX: MatrixRow[] = [
  { card: 'audio', node: AudioNode, command: INSERT_AUDIO_COMMAND, dataset: {}, openInEditMode: false },
  {
    card: 'bookmark',
    node: BookmarkNode,
    command: INSERT_BOOKMARK_COMMAND,
    dataset: { url: 'https://example.com' },
    openInEditMode: false,
    requiresRangeSelection: true,
  },
  { card: 'button', node: ButtonNode, command: INSERT_BUTTON_COMMAND, dataset: {}, openInEditMode: true },
  {
    card: 'callout',
    node: CalloutNode,
    command: INSERT_CALLOUT_COMMAND,
    dataset: { calloutText: 'Hello' },
    openInEditMode: true,
  },
  { card: 'file', node: FileNode, command: INSERT_FILE_COMMAND, dataset: { src: 'file.pdf' }, openInEditMode: false },
  {
    card: 'gallery',
    node: GalleryNode,
    command: INSERT_GALLERY_COMMAND,
    dataset: { images: [] },
    openInEditMode: false,
  },
  {
    card: 'header',
    node: HeaderNode,
    command: INSERT_HEADER_COMMAND,
    dataset: { version: 2 },
    openInEditMode: true,
  },
  {
    card: 'html',
    node: HtmlNode,
    command: INSERT_HTML_COMMAND,
    dataset: { html: '<p>Hello</p>' },
    openInEditMode: true,
  },
  {
    card: 'image',
    node: ImageNode,
    command: INSERT_IMAGE_COMMAND,
    dataset: { src: 'https://example.com/image.png' },
    openInEditMode: false,
  },
  {
    card: 'toggle',
    node: ToggleNode,
    command: INSERT_TOGGLE_COMMAND,
    dataset: { heading: 'Title' },
    openInEditMode: true,
  },
  {
    card: 'video',
    node: VideoNode,
    command: INSERT_VIDEO_COMMAND,
    dataset: { src: 'video.mp4' },
    openInEditMode: false,
  },
]

describe('CardInsertPlugin', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(INSERT_MATRIX)(
    '$card: a valid dataset returns true and fires INSERT_CARD_COMMAND with the wrapper node and matrix openInEditMode',
    async ({ node, command, dataset, openInEditMode, requiresRangeSelection }) => {
      editor = createTestEditor({ nodes: [node] })
      await mountRegistrar(editor)

      if (requiresRangeSelection) {
        await updateEditor(editor, () => {
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode('https://example.com'))
          root.append(paragraph)
          paragraph.select(0, 23)
        })
      }

      const { ref, removeListener } = captureInsertCard(editor)

      const dispatched = editor.dispatchCommand(command, dataset)
      expect(dispatched).toBe(true)
      expect(ref.payload).toBeDefined()
      expect(ref.payload?.cardNode).toBeInstanceOf(node)
      if (openInEditMode) {
        expect(ref.payload).toHaveProperty('openInEditMode', true)
      } else {
        expect(ref.payload).not.toHaveProperty('openInEditMode')
      }

      removeListener()
    },
  )

  it.each(INSERT_MATRIX.filter(({ card }) => ['header', 'html', 'video'].includes(card)))(
    '$card: non-object payloads return false and never fire INSERT_CARD_COMMAND',
    async ({ node, command }) => {
      editor = createTestEditor({ nodes: [node] })
      await mountRegistrar(editor)

      const { ref, removeListener } = captureInsertCard(editor)

      expect(editor.dispatchCommand(command, null)).toBe(false)
      expect(editor.dispatchCommand(command, 'not-an-object')).toBe(false)
      expect(ref.payload).toBeUndefined()

      removeListener()
    },
  )

  it('bookmark: with no range selection the insert command returns false and never fires INSERT_CARD_COMMAND', async () => {
    editor = createTestEditor({ nodes: [BookmarkNode] })
    await mountRegistrar(editor)

    const { ref, removeListener } = captureInsertCard(editor)

    expect(editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, { url: 'https://example.com' })).toBe(false)
    expect(ref.payload).toBeUndefined()

    removeListener()
  })

  it("audio: claims INSERT_MEDIA_COMMAND for the 'audio' type and re-dispatches INSERT_AUDIO_COMMAND", async () => {
    editor = createTestEditor({ nodes: [AudioNode] })
    await mountRegistrar(editor)

    const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
    const file = new File([], 'test.mp3', { type: 'audio/mpeg' })

    const claimed = editor.dispatchCommand(INSERT_MEDIA_COMMAND, { type: 'audio', file })
    expect(claimed).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(INSERT_AUDIO_COMMAND, { initialFile: file })
  })

  it("video: claims INSERT_MEDIA_COMMAND for the 'video' type and re-dispatches INSERT_VIDEO_COMMAND", async () => {
    editor = createTestEditor({ nodes: [VideoNode] })
    await mountRegistrar(editor)

    const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
    const file = new File([], 'test.mp4', { type: 'video/mp4' })

    const claimed = editor.dispatchCommand(INSERT_MEDIA_COMMAND, { type: 'video', file })
    expect(claimed).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(INSERT_VIDEO_COMMAND, { initialFile: file })
  })

  it("media: a 'file'-type payload is claimed by no handler (the File gap, pinned as current behavior)", async () => {
    editor = createTestEditor({ nodes: [AudioNode, ImageNode, VideoNode] })
    await mountRegistrar(editor)

    const file = new File([], 'test.pdf', { type: 'application/pdf' })
    expect(editor.dispatchCommand(INSERT_MEDIA_COMMAND, { type: 'file', file })).toBe(false)
  })

  it('header: registers its insert command once per mount, not once per render', async () => {
    editor = createTestEditor({ nodes: [HeaderNode] })
    mockComposerContext(editor)
    const registerSpy = vi.spyOn(editor, 'registerCommand')

    const headerRegistrations = () =>
      registerSpy.mock.calls.filter(([command]) => command === INSERT_HEADER_COMMAND).length

    const { rerender } = renderHook(() => CardInsertPlugin())
    expect(headerRegistrations()).toBe(1)

    rerender()
    rerender()
    // The deleted HeaderPlugin's effect had no dependency array and
    // re-registered on every render; the registrar registers once per mount.
    expect(headerRegistrations()).toBe(1)
  })
})
