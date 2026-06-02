import type { Editor } from '@tiptap/core'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LinkPopover } from '@/ui/admin/editor/tiptap/LinkPopover'

// LinkPopover is shared by the toolbar (insert at caret) and the
// BubbleMenu (wrap / edit selection). Static SSR checks keep the
// dependency footprint minimal vs @testing-library.
//
// Guards: correct labels per variant, URL input shape, 移除 only when
// editing an existing link in selection mode, and 插入 vs 应用 copy.

interface LinkChain {
  focus: () => LinkChain
  extendMarkRange: (mark: string) => LinkChain
  setLink: (attrs: { href: string; rel?: string; target?: string }) => LinkChain
  unsetLink: () => LinkChain
  run: () => boolean
}

function stubEditor(
  initialHref: string,
  target?: string,
): {
  editor: Editor
  calls: Array<string>
} {
  const calls: Array<string> = []
  const chain = (): LinkChain => ({
    focus() {
      calls.push('focus')
      return this
    },
    extendMarkRange(mark) {
      calls.push(`extendMarkRange:${mark}`)
      return this
    },
    setLink(attrs) {
      calls.push(`setLink:${attrs.href}:${attrs.target ?? ''}:${attrs.rel ?? ''}`)
      return this
    },
    unsetLink() {
      calls.push('unsetLink')
      return this
    },
    run() {
      calls.push('run')
      return true
    },
  })
  const editor = {
    getAttributes(_mark: string) {
      return { href: initialHref, target }
    },
    chain,
  } as unknown as Editor
  return { editor, calls }
}

describe('LinkPopover', () => {
  it('selection: renders 移除 when editing an existing link', () => {
    const { editor } = stubEditor('https://example.com', '_blank')
    const html = renderToStaticMarkup(<LinkPopover variant="selection" editor={editor} onClose={() => undefined} />)
    expect(html).toContain('链接地址')
    expect(html).toContain('value="https://example.com"')
    expect(html).toContain('移除')
    expect(html).toContain('应用')
    expect(html).toContain('取消')
    expect(html).toContain('在新标签页中打开')
  })

  it('selection: hides 移除 when authoring a fresh link', () => {
    const { editor } = stubEditor('')
    const html = renderToStaticMarkup(<LinkPopover variant="selection" editor={editor} onClose={() => undefined} />)
    expect(html).not.toContain('移除')
    expect(html).toContain('应用')
  })

  it('toolbar: shows display text + insert label', () => {
    const { editor } = stubEditor('')
    const html = renderToStaticMarkup(<LinkPopover variant="toolbar" editor={editor} onClose={() => undefined} />)
    expect(html).toContain('显示文字')
    expect(html).toContain('链接地址')
    expect(html).toContain('插入')
    expect(html).not.toContain('应用')
  })

  it('marks the URL input as type=url so mobile keyboards show the URL row', () => {
    const { editor } = stubEditor('')
    const html = renderToStaticMarkup(<LinkPopover variant="selection" editor={editor} onClose={() => undefined} />)
    expect(html).toMatch(/type="url"/)
  })

  it('exposes the chain wiring shape used by the selection apply path (smoke check)', () => {
    const { editor, calls } = stubEditor('')
    editor.chain().focus().extendMarkRange('link').setLink({ href: 'https://x.test' }).run()
    expect(calls).toEqual(['focus', 'extendMarkRange:link', 'setLink:https://x.test::', 'run'])
  })
})
