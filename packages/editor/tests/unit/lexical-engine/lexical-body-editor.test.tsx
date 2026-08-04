// @vitest-environment happy-dom

import type { ImagePickerRenderProps } from '@kobato/editor/engine/picker-slot'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { ElementNode, LexicalEditor } from 'lexical'

import {
  INSERT_IMAGE_COMMAND,
  INSERT_MUSIC_COMMAND,
  OPEN_IMAGE_PICKER_COMMAND,
} from '@kobato/editor/engine/lexical/commands'
import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { render, waitFor } from '@testing-library/react'
import { $createTextNode, $getRoot, getNearestEditorFromDOMNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// LexicalBodyEditor kernel smoke tests (R3a): initial load, bodyKey
// reload, change reporting with canonical output, read-only mode,
// placeholder empty state, picker commands, and the decorate node views.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function text(text: string): Record<string, unknown> {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function body(children: unknown[] = []): LexicalBody {
  return unsafeCast<LexicalBody>({ root: { ...elementBase(), type: 'root', children } })
}

function editorOf(container: HTMLElement): LexicalEditor {
  // Note: `[contenteditable]` (any value) — setEditable(false) flips the
  // attribute to `contenteditable="false"` instead of removing it.
  const editable = container.querySelector('[contenteditable]')
  if (editable === null) {
    throw new Error('contenteditable not found')
  }
  const editor = getNearestEditorFromDOMNode(editable)
  if (editor === null) {
    throw new Error('editor not found')
  }
  return editor
}

const fakeImage = {
  id: 'img-1',
  kind: 'generic',
  storagePath: 'storage/1.png',
  publicUrl: '/media/1.png',
  mimeType: 'image/png',
  width: 640,
  height: 480,
  byteSize: 1024,
  thumbhash: 'thumb-1',
  uploaderId: null,
  uploaderName: null,
  note: '一张图',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const

const fakeMusic = {
  id: 'm-1',
  source: 'netease' as const,
  sourceId: 's-1',
  playerId: 'abcd1234abcd1234',
  name: '歌',
  artist: ['人'],
  album: '专辑',
  audioStoragePath: 'audio/1.mp3',
  audioUrl: '/audio/1.mp3',
  coverStoragePath: 'cover/1.jpg',
  coverUrl: '/cover/1.jpg',
  lyric: null,
  uploaderId: null,
  uploaderName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('editor/engine/lexical/LexicalBodyEditor', () => {
  it('renders the initial body into the contenteditable', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('你好，世界')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(container.querySelector('[contenteditable="true"]')).not.toBeNull())
    expect(container.querySelector('[contenteditable="true"]')?.textContent).toContain('你好，世界')
  })

  it('reports a canonical body on mount (bodyKey reset semantics)', async () => {
    const onBodyChange = vi.fn()
    render(<LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />)
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = onBodyChange.mock.calls[0]?.[0] as LexicalBody
    expect(reported.root.children[0]?.type).toBe('paragraph')
    // Canonical form: paragraph carries textFormat/textStyle.
    const p = reported.root.children[0] as { textFormat?: number; textStyle?: string }
    expect(p.textFormat).toBe(0)
    expect(p.textStyle).toBe('')
  })

  it('fires onBodyChange on edits with a canonical body', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('a')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()
    const editor = editorOf(container)
    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<ElementNode>(first).append($createTextNode('b'))
      }
    })
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = onBodyChange.mock.calls.at(-1)?.[0] as LexicalBody
    const p = reported.root.children[0] as { children: { text?: string; type: string }[] }
    // The inserted 'b' merges with the existing 'a' text node ('ab').
    expect(p.children.some((child) => child.type === 'text' && (child.text ?? '').includes('b'))).toBe(true)
  })

  it('reloads content when bodyKey changes and reports the canonical reset', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('旧内容')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() =>
      expect(view.container.querySelector('[contenteditable="true"]')?.textContent).toContain('旧内容'),
    )
    view.rerender(
      <LexicalBodyEditor initialBody={body([paragraph([text('新内容')])])} bodyKey="k2" onBodyChange={onBodyChange} />,
    )
    await waitFor(() =>
      expect(view.container.querySelector('[contenteditable="true"]')?.textContent).toContain('新内容'),
    )
    const reported = onBodyChange.mock.calls.at(-1)?.[0] as LexicalBody
    expect(JSON.stringify(reported)).toContain('新内容')
  })

  it('ignores initialBody changes while bodyKey stays the same', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('原内容')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() =>
      expect(view.container.querySelector('[contenteditable="true"]')?.textContent).toContain('原内容'),
    )
    onBodyChange.mockClear()
    view.rerender(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('不应生效')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    // Give the reset effect a chance to fire; it must not.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onBodyChange).not.toHaveBeenCalled()
    expect(view.container.querySelector('[contenteditable="true"]')?.textContent).toContain('原内容')
  })

  it('becomes read-only when disabled', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(editorOf(view.container).isEditable()).toBe(true))
    view.rerender(<LexicalBodyEditor initialBody={body()} bodyKey="k1" onBodyChange={onBodyChange} disabled />)
    await waitFor(() => expect(editorOf(view.container).isEditable()).toBe(false))
  })

  it('marks an empty document with the placeholder class', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => {
      const editable = container.querySelector('[contenteditable="true"]')
      expect(editable).not.toBeNull()
      expect(editable?.classList.contains('is-editor-empty')).toBe(true)
      expect(editable?.getAttribute('data-placeholder')).toBe('在此处开始编写内容…')
    })
  })

  it('clears the placeholder class once content exists', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => {
      const editable = container.querySelector('[contenteditable="true"]')
      expect(editable?.classList.contains('is-editor-empty')).toBe(true)
    })
    const editor = editorOf(container)
    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<ElementNode>(first).append($createTextNode('有内容了'))
      }
    })
    await waitFor(() => {
      const editable = container.querySelector('[contenteditable="true"]')
      expect(editable?.classList.contains('is-editor-empty')).toBe(false)
    })
  })

  it('INSERT_IMAGE_COMMAND inserts an image node into the document', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()
    const editor = editorOf(container)
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, { ...fakeImage })
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = onBodyChange.mock.calls.at(-1)?.[0] as LexicalBody
    const types = reported.root.children.map((child) => child.type)
    expect(types).toContain('image')
    const image = reported.root.children.find((child) => child.type === 'image') as { src: string; imageId: string }
    expect(image.src).toBe('/media/1.png')
    expect(image.imageId).toBe('img-1')
  })

  it('INSERT_MUSIC_COMMAND inserts a music player node', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()
    const editor = editorOf(container)
    editor.dispatchCommand(INSERT_MUSIC_COMMAND, { ...fakeMusic })
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = onBodyChange.mock.calls.at(-1)?.[0] as LexicalBody
    expect(reported.root.children.map((child) => child.type)).toContain('musicPlayer')
  })

  it('OPEN_IMAGE_PICKER_COMMAND opens the injected image picker', async () => {
    const onBodyChange = vi.fn()
    const renderImagePicker = vi.fn((props: ImagePickerRenderProps) => (
      <div data-testid="image-picker-dialog">{String(props.open)}</div>
    ))
    const renderMusicPicker = vi.fn(() => null)
    const { container } = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
        pickerRenderers={{ renderImagePicker, renderMusicPicker }}
      />,
    )
    await waitFor(() => expect(container.querySelector('[contenteditable]')).not.toBeNull())
    const editor = editorOf(container)
    editor.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined)
    await waitFor(() => expect(renderImagePicker.mock.calls.at(-1)?.[0].open).toBe(true))
  })

  it('renders the decorate node views for the custom dialect', async () => {
    const onBodyChange = vi.fn()
    const rich = body([
      paragraph([
        { type: 'mathInline', version: 1, tex: 'a^2', mathml: '<math><mi>a</mi></math>', ptKey: 'm1' },
        { type: 'footnoteRef', version: 1, targetKey: 'def-1', index: 1, ptKey: 'fr1' },
      ]),
      {
        type: 'image',
        version: 1,
        src: '/img.png',
        alt: '图',
        width: 100,
        height: 50,
        ptKey: 'imgk',
      },
      { type: 'mathBlock', version: 1, tex: 'x=1', ptKey: 'mb1' },
      { type: 'musicPlayer', version: 1, playerId: 'abcd1234abcd1234', ptKey: 'mp1' },
      { ...elementBase(), type: 'solution', ptKey: 's1', children: [paragraph([text('解在这里')])] },
      {
        ...elementBase(),
        type: 'twoColumn',
        ptKey: 'tc1',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('左')])] },
          { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('右')])] },
        ],
      },
    ])
    const { container } = render(<LexicalBodyEditor initialBody={rich} bodyKey="k1" onBodyChange={onBodyChange} />)
    await waitFor(() => {
      expect(container.querySelector('[data-math-inline]')).not.toBeNull()
      expect(container.querySelector('sup[data-footnote-ref]')).not.toBeNull()
      expect(container.querySelector('[data-image-node-view]')).not.toBeNull()
      expect(container.querySelector('[data-pt-block-card="mathBlock"]')).not.toBeNull()
      expect(container.querySelector('[data-pt-block-card="musicPlayer"]')).not.toBeNull()
      expect(container.querySelector('blockquote[data-pt-solution]')).not.toBeNull()
      expect(container.querySelector('section[data-pt-two-column]')).not.toBeNull()
      expect(container.querySelector('[data-pt-two-column-pane][data-side="left"]')).not.toBeNull()
      expect(container.querySelector('[data-pt-two-column-pane][data-side="right"]')).not.toBeNull()
    })
  })

  it('renders picker dialogs from the injected pickerRenderers', async () => {
    const onBodyChange = vi.fn()
    const renderImagePicker = vi.fn(() => <div data-testid="image-picker-dialog">媒体库</div>)
    const renderMusicPicker = vi.fn(() => <div data-testid="music-picker-dialog">音乐库</div>)
    const { container } = render(
      <LexicalBodyEditor
        initialBody={body()}
        bodyKey="k1"
        onBodyChange={onBodyChange}
        pickerRenderers={{ renderImagePicker, renderMusicPicker }}
      />,
    )
    await waitFor(() => expect(container.querySelector('[contenteditable="true"]')).not.toBeNull())
    // The dialogs render closed; the renderers still receive the open props.
    expect(renderImagePicker).toHaveBeenCalledWith(
      expect.objectContaining({ open: false, onOpenChange: expect.any(Function), onPick: expect.any(Function) }),
    )
    expect(renderMusicPicker).toHaveBeenCalledWith(
      expect.objectContaining({ open: false, onOpenChange: expect.any(Function), onPick: expect.any(Function) }),
    )
  })

  it('fires an invalid body without crashing (degrades to an empty document)', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor
        initialBody={body([{ type: 'mystery', version: 1 }])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(container.querySelector('[contenteditable="true"]')).not.toBeNull())
    expect(container.querySelector('[contenteditable="true"]')?.textContent ?? '').not.toContain('mystery')
  })

  it('autolinks a typed URL and reports it as a regular link node', async () => {
    const onBodyChange = vi.fn()
    const { container } = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()
    const editor = editorOf(container)
    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<ElementNode>(first).append($createTextNode('https://example.com/path'))
      }
    })
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = onBodyChange.mock.calls.at(-1)?.[0] as LexicalBody
    const p = reported.root.children[0] as { children: { type?: string; url?: string }[] }
    // The AutoLinkPlugin transform turns the bare URL into an AutoLinkNode
    // (`type: 'autolink'` in the editor state); the report path rewrites it
    // to a regular LinkNode so the wire dialect never sees the type.
    const link = p.children.find((child) => child.type === 'link')
    expect(link).toBeDefined()
    expect(link?.url).toBe('https://example.com/path')
    expect(JSON.stringify(reported)).not.toContain('autolink')
  })
})
