import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $getRoot, COMMAND_PRIORITY_LOW, createEditor, DROP_COMMAND, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectionMock = vi.hoisted(() => ({ forceNull: false }))
vi.mock('lexical', async (importOriginal) => {
  const original = await importOriginal<typeof import('lexical')>()
  return {
    ...original,
    // lets a test pin the selection to null even after selectEnd()
    $getSelection: () => (selectionMock.forceNull ? null : original.$getSelection()),
  }
})
vi.mock('@lexical/clipboard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@lexical/clipboard')>()
  return {
    ...original,
    // spied so a test can prove the insert is skipped without a selection
    $insertDataTransferForRichText: vi.fn(original.$insertDataTransferForRichText),
  }
})

import { $insertDataTransferForRichText } from '@lexical/clipboard'

import { tick } from '#/utils/test-editor'
import { ImageNode } from '@/nodes/ImageNode'
import { INSERT_MEDIA_COMMAND, MIME_TEXT_HTML } from '@/plugins/behaviour/clipboard-protocol'
import {
  handleFileDrop,
  registerDragOverSuppression,
  registerFileDropCommands,
  type FileDropPorts,
} from '@/plugins/behaviour/file-drop'

const PORTS: FileDropPorts = {
  hasUploader: () => true,
  // the host's per-upload-type mime config — without it the image card
  // claims nothing (the routing rule)
  fileTypes: () => ({ image: { mimeTypes: ['image/png', 'image/jpeg'] } }),
}

function createFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('file drop', () => {
  let editor: LexicalEditor
  let rootElement: HTMLElement
  let mediaClaims: Array<{ type: string; file: File }>

  beforeEach(() => {
    selectionMock.forceNull = false
    vi.mocked($insertDataTransferForRichText).mockClear()
    document.body.innerHTML = ''
    rootElement = document.createElement('div')
    rootElement.contentEditable = 'true'
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      nodes: [ImageNode],
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
    mediaClaims = []
    editor.registerCommand(
      INSERT_MEDIA_COMMAND,
      (payload: { type: string; file: File }) => {
        mediaClaims.push(payload)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  })

  describe('handleFileDrop', () => {
    it('claims image files for the image card, one dispatch per file', () => {
      handleFileDrop(editor, [createFile('a.png', 'image/png'), createFile('b.jpg', 'image/jpeg')], PORTS)

      expect(mediaClaims).toHaveLength(2)
      expect(mediaClaims.every((claim) => claim.type === 'image')).toBe(true)
      expect(mediaClaims.map((claim) => claim.file.name)).toEqual(['a.png', 'b.jpg'])
    })

    it('drops nothing when there is no uploader', () => {
      handleFileDrop(editor, [createFile('a.png', 'image/png')], { ...PORTS, hasUploader: () => false })

      expect(mediaClaims).toHaveLength(0)
    })

    it('ignores files no card claims', () => {
      handleFileDrop(editor, [createFile('notes.txt', 'text/plain')], PORTS)

      expect(mediaClaims).toHaveLength(0)
    })
  })

  describe('registerFileDropCommands', () => {
    it('routes file drops onto the DRAG_DROP_PASTE bus', () => {
      const busHandler = vi.fn()
      registerFileDropCommands(editor, PORTS)
      editor.registerCommand(DRAG_DROP_PASTE, busHandler, COMMAND_PRIORITY_LOW)

      const event = new Event('drop', { bubbles: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', { value: { files: [createFile('a.png', 'image/png')] } })

      const handled = editor.dispatchCommand(DROP_COMMAND, event)

      expect(handled).toBe(true)
      expect(busHandler).toHaveBeenCalled()
    })

    it('ignores drops with no files', () => {
      registerFileDropCommands(editor, PORTS)

      const event = new Event('drop', { bubbles: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', { value: { files: [] } })

      expect(editor.dispatchCommand(DROP_COMMAND, event)).toBe(false)
    })

    it('the bus handler claims the files', () => {
      registerFileDropCommands(editor, PORTS)

      editor.dispatchCommand(DRAG_DROP_PASTE, [createFile('a.png', 'image/png')])

      expect(mediaClaims).toHaveLength(1)
    })
  })

  describe('registerDragOverSuppression', () => {
    function dragEvent(type: string, target: Element): DragEvent {
      const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', { value: {} })
      Object.defineProperty(event, 'target', { value: target })
      return event
    }

    it('suppresses dragover outside cards', () => {
      registerDragOverSuppression(editor)

      const outside = document.createElement('div')
      rootElement.appendChild(outside)

      const event = dragEvent('dragover', outside)
      outside.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    })

    it('lets dragover through over a card', () => {
      registerDragOverSuppression(editor)

      const card = document.createElement('div')
      card.dataset.inklingCard = 'image'
      rootElement.appendChild(card)

      const event = dragEvent('dragover', card)
      card.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    })

    it('prevents the default on html drops and inserts the content', async () => {
      registerDragOverSuppression(editor)
      await tick()

      const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', {
        value: { getData: (mime: string) => (mime === MIME_TEXT_HTML ? '<p>dropped html</p>' : '') },
      })
      Object.defineProperty(event, 'target', { value: rootElement })

      rootElement.dispatchEvent(event)
      await tick()

      expect(event.defaultPrevented).toBe(true)
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toContain('dropped html')
      })
    })

    it('skips the insert when no selection can be established', async () => {
      registerDragOverSuppression(editor)
      await tick()
      selectionMock.forceNull = true

      const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', {
        value: { getData: (mime: string) => (mime === MIME_TEXT_HTML ? '<p>dropped html</p>' : '') },
      })
      Object.defineProperty(event, 'target', { value: rootElement })

      rootElement.dispatchEvent(event)
      await tick()

      expect(event.defaultPrevented).toBe(true)
      expect(vi.mocked($insertDataTransferForRichText)).not.toHaveBeenCalled()
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe('')
      })
    })

    it('detaches on teardown', () => {
      const teardown = registerDragOverSuppression(editor)
      teardown()

      const outside = document.createElement('div')
      rootElement.appendChild(outside)

      const event = dragEvent('dragover', outside)
      outside.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    })
  })
})
