import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor, type NodeKey } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { $isImageNode, type BaseImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { backfillImageDimensions, clampImageCardWidth, migrateImageDataUrl } from '@/plugins/behaviour/image-lifecycle'
import { dataSrcToFile } from '@/utils/dataSrcToFile'
import { getImageDimensions } from '@/utils/getImageDimensions'

vi.mock('@/utils/dataSrcToFile', () => ({
  dataSrcToFile: vi.fn(),
}))

vi.mock('@/utils/getImageDimensions', () => ({
  getImageDimensions: vi.fn(),
}))

const DATA_SRC = 'data:image/png;base64,iVBORw0KGgo='

describe('migrateImageDataUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('converts a data: src and uploads the file', async () => {
    const file = new File(['img'], 'data-src-image-1.png', { type: 'image/png' })
    vi.mocked(dataSrcToFile).mockResolvedValue(file)
    const runUpload = vi.fn()

    const fired = await migrateImageDataUrl({ src: DATA_SRC }, { runUpload, onError: vi.fn() })

    expect(fired).toBe(true)
    expect(dataSrcToFile).toHaveBeenCalledExactlyOnceWith(DATA_SRC)
    expect(runUpload).toHaveBeenCalledExactlyOnceWith(file)
  })

  it.each([
    ['a remote src', 'https://example.com/image.png', undefined],
    ['an in-flight upload', DATA_SRC, true],
  ])('skips %s', async (_label, src, isLoading) => {
    const runUpload = vi.fn()

    const fired = await migrateImageDataUrl({ src, isLoading }, { runUpload, onError: vi.fn() })

    expect(fired).toBe(false)
    expect(runUpload).not.toHaveBeenCalled()
  })

  it('abandons a stale run after the conversion await', async () => {
    const file = new File(['img'], 'data-src-image-1.png', { type: 'image/png' })
    vi.mocked(dataSrcToFile).mockResolvedValue(file)
    const runUpload = vi.fn()

    const fired = await migrateImageDataUrl({ src: DATA_SRC, isCancelled: () => true }, { runUpload, onError: vi.fn() })

    expect(fired).toBe(true)
    expect(runUpload).not.toHaveBeenCalled()
  })

  it('reports a conversion failure through onError', async () => {
    const failure = new Error('conversion failed')
    vi.mocked(dataSrcToFile).mockRejectedValue(failure)
    const onError = vi.fn()

    const fired = await migrateImageDataUrl({ src: DATA_SRC }, { runUpload: vi.fn(), onError })

    expect(fired).toBe(false)
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
  })
})

describe('backfillImageDimensions', () => {
  let editor: LexicalEditor
  let nodeKey: NodeKey

  beforeEach(async () => {
    vi.clearAllMocks()
    editor = createHeadlessEditor({
      nodes: [ImageNode],
      onError: (error) => {
        throw error
      },
    })
    vi.mocked(getImageDimensions).mockResolvedValue({ width: 100, height: 50 })
    nodeKey = ''
    await updateEditor(editor, () => {
      const node = $createImageNode({ src: 'https://example.com/image.png' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })
  })

  function readDimensions(): { width: number | null; height: number | null } {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      return $isImageNode(node) ? { width: node.width, height: node.height } : { width: null, height: null }
    })
  }

  // the test-local write seam: narrows through the guard, never a cast
  function writeNode(mutator: (node: BaseImageNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        mutator(node)
      }
    })
  }

  it('writes dimensions read from the src when the node lacks them', async () => {
    const write = writeNode

    const fired = await backfillImageDimensions(
      editor,
      nodeKey,
      { src: 'https://example.com/image.png' },
      { write, onError: vi.fn() },
    )

    expect(fired).toBe(true)
    expect(readDimensions()).toEqual({ width: 100, height: 50 })
  })

  it('skips when the node already has dimensions', async () => {
    writeNode((node) => {
      node.width = 10
      node.height = 10
    })
    // let the microtask commit land before the backfill reads
    await tick()

    const fired = await backfillImageDimensions(
      editor,
      nodeKey,
      { src: 'https://example.com/image.png' },
      { write: vi.fn(), onError: vi.fn() },
    )

    expect(fired).toBe(false)
    expect(getImageDimensions).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty src', { src: '' }],
    ['an initial file', { src: 'https://example.com/image.png', initialFile: new File(['x'], 'x.png') }],
    ['a dialog trigger', { src: 'https://example.com/image.png', triggerFileDialog: true }],
  ])('skips with %s', async (_label, options) => {
    const fired = await backfillImageDimensions(editor, nodeKey, options, { write: vi.fn(), onError: vi.fn() })

    expect(fired).toBe(false)
  })

  it('reports a broken src through onError and leaves dimensions unset', async () => {
    const failure = new Error('unloadable')
    vi.mocked(getImageDimensions).mockRejectedValue(failure)
    const onError = vi.fn()

    const fired = await backfillImageDimensions(
      editor,
      nodeKey,
      { src: 'https://example.com/broken.png' },
      { write: writeNode, onError },
    )

    expect(fired).toBe(false)
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(readDimensions()).toEqual({ width: null, height: null })
  })
})

describe('clampImageCardWidth', () => {
  it('rewrites a disallowed width to the default', () => {
    const write = vi.fn()

    const clamped = clampImageCardWidth('full', ['regular', 'wide'], { write })

    expect(clamped).toBe('regular')
    expect(write).toHaveBeenCalledOnce()
  })

  it('picks the first allowed width when regular is not allowed', () => {
    const write = vi.fn()

    const clamped = clampImageCardWidth('regular', ['wide', 'full'], { write })

    expect(clamped).toBe('wide')
  })

  it('returns null when the current width is allowed', () => {
    const write = vi.fn()

    expect(clampImageCardWidth('wide', ['regular', 'wide'], { write })).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })
})
