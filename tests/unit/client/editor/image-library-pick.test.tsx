// Unit tests for the image-library pick on the pick seam (landing-4):
// `registerCardPicker('image', …)` opens `ImageLibraryPicker` for the fresh
// empty KobatoImageNode (the override inserts it with `openPicker`), and the
// pick writes the full library dataset onto the node through the card write
// seam — the freshly picked card renders with the image immediately.
//
// The dialog is stubbed: its props (open/onOpenChange/onPick) are the seam's
// observable boundary. The composer context is mocked with a real headless
// editor (the barrel's createHeadlessEditor) so the write seam runs against
// a live node.

// @vitest-environment jsdom

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { act, render } from '@testing-library/react'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { ImageLibraryPickerProps } from '@/ui/admin/editor/pickers/ImageLibraryPicker'

import { ImageLibraryCardPicker, imageLibraryPickDataset } from '@/client/editor/image-library-pick'
import { KobatoImageNode } from '@/client/editor/kobato-image-node'
import { createHeadlessEditor } from '@/inkling'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

const pickerProps: { current: ImageLibraryPickerProps | null } = { current: null }
vi.mock('@/ui/admin/editor/pickers/ImageLibraryPicker', () => ({
  ImageLibraryPicker: (props: ImageLibraryPickerProps) => {
    pickerProps.current = props
    return null
  },
}))

const sharedEditor: LexicalEditor = createHeadlessEditor({ nodes: [KobatoImageNode], onError: () => {} })
vi.mocked(useLexicalComposerContext).mockReturnValue([sharedEditor, { getTheme: () => null }])

function makeImage(overrides: Partial<AdminImageDto> = {}): AdminImageDto {
  return {
    id: 'img_9',
    kind: 'generic',
    storagePath: 'objects/picked.png',
    publicUrl: 'https://example.com/storage/objects/picked.png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    byteSize: 12345,
    thumbhash: 'th-picked',
    uploaderId: 'user-1',
    uploaderName: '雨帆',
    note: '题注备注',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Inserts one empty KobatoImageNode into the shared editor; resolves its key after commit. */
async function insertEmptyImageNode(): Promise<string> {
  let key = ''
  await new Promise<void>((resolve) => {
    sharedEditor.update(
      () => {
        const node = new KobatoImageNode({})
        $getRoot().append(node)
        key = node.getKey()
      },
      { onUpdate: () => resolve() },
    )
  })
  return key
}

/** The node's picked fields, read inside an editor-state read. */
function readImageFields(nodeKey: string) {
  return sharedEditor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey)
    if (!(node instanceof KobatoImageNode)) {
      return null
    }
    return {
      src: node.src,
      alt: node.alt,
      width: node.width,
      height: node.height,
      thumbhash: node.thumbhash,
      storagePath: node.storagePath,
      imageId: node.imageId,
    }
  })
}

describe('imageLibraryPickDataset', () => {
  it('maps the library DTO onto the node dataset, src in site-owned origin-relative form', () => {
    expect(imageLibraryPickDataset(makeImage())).toEqual({
      src: '/storage/objects/picked.png',
      alt: '题注备注',
      width: 640,
      height: 480,
      thumbhash: 'th-picked',
      storagePath: 'objects/picked.png',
      imageId: 'img_9',
    })
  })

  it('passes external URLs and absent thumbhash/note through the guards', () => {
    expect(
      imageLibraryPickDataset(makeImage({ publicUrl: 'https://cdn.example.com/x.png', thumbhash: null, note: null })),
    ).toMatchObject({
      src: 'https://cdn.example.com/x.png',
      alt: '',
      thumbhash: '',
    })
  })
})

describe('ImageLibraryCardPicker', () => {
  beforeEach(() => {
    pickerProps.current = null
  })

  it('writes the full library dataset onto the node at pick time', async () => {
    const nodeKey = await insertEmptyImageNode()
    expect(readImageFields(nodeKey)?.src).toBe('')

    const close = vi.fn()
    render(<ImageLibraryCardPicker editor={sharedEditor} nodeKey={nodeKey} close={close} />)
    const onPick = pickerProps.current?.onPick
    expect(onPick).toBeDefined()

    await act(async () => {
      onPick?.(makeImage())
      // Lexical 0.46 commits the pick write on a microtask — drain it
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(readImageFields(nodeKey)).toEqual({
      src: '/storage/objects/picked.png',
      alt: '题注备注',
      width: 640,
      height: 480,
      thumbhash: 'th-picked',
      storagePath: 'objects/picked.png',
      imageId: 'img_9',
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes without writing when the dialog is dismissed', async () => {
    const nodeKey = await insertEmptyImageNode()
    const close = vi.fn()
    render(<ImageLibraryCardPicker editor={sharedEditor} nodeKey={nodeKey} close={close} />)

    act(() => {
      pickerProps.current?.onOpenChange?.(false)
    })

    expect(close).toHaveBeenCalledTimes(1)
    expect(readImageFields(nodeKey)?.src).toBe('')
  })
})
