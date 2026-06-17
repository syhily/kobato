import { describe, expect, it, vi } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { CommentEditorToolbar } from '@/ui/public/comments/CommentEditorToolbar'

// CommentEditorToolbar reads its active-state from TipTap's `useEditorState`
// and fires `editor.chain().focus().toggleX().run()` on click. We can't bring
// up a real TipTap Editor under SSR (it needs a browser DOM + ProseMirror
// view), so we mock `@tiptap/react` to return a controlled `state` object and
// a no-op chain stub. This lets us render every active/inactive branch of the
// toolbar purely from props.

interface ActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
  link: boolean
}

const INACTIVE: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  link: false,
}

// Hoisted mutable so each test can drive a different active-state through the
// mocked `useEditorState` selector. Initialized lazily inside the mock body.
const editorState = vi.hoisted(() => ({ active: null as ActiveState | null }))

// The editor stub records chain calls so we could assert on interactions, but
// for SSR coverage we only need it to not throw when rendered.
function makeEditorStub() {
  const chain = () => {
    const self = {
      focus: () => self,
      toggleBold: () => self,
      toggleItalic: () => self,
      toggleUnderline: () => self,
      toggleStrike: () => self,
      toggleCode: () => self,
      toggleBulletList: () => self,
      toggleOrderedList: () => self,
      toggleBlockquote: () => self,
      extendMarkRange: () => self,
      setLink: () => self,
      unsetLink: () => self,
      run: () => true,
    }
    return self
  }
  return {
    chain,
    getAttributes: () => ({}) as Record<string, unknown>,
  } as unknown as React.ComponentProps<typeof CommentEditorToolbar>['editor']
}

vi.mock('@tiptap/react', () => ({
  // useEditorState returns the hoisted active-state so the toolbar renders the
  // active/inactive variant for every mark/node. We bypass the real TipTap
  // selector (which needs a live ProseMirror editor) entirely. Falls back to
  // all-inactive before the first test sets a state.
  useEditorState: () =>
    editorState.active ?? {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      link: false,
    },
}))

describe('snapshot: CommentEditorToolbar', () => {
  function renderWith(active: Partial<ActiveState>, disabled = false) {
    editorState.active = { ...INACTIVE, ...active }
    return stableHtml(renderToHtml(<CommentEditorToolbar editor={makeEditorStub()} disabled={disabled} />))
  }

  it('renders all nine tool buttons in the inactive state', () => {
    // Override the mock for this case: useEditorState must return INACTIVE.
    const html = renderWith({})
    expect(html).toContain('评论格式工具栏')
    expect(html).toContain('加粗 (Cmd/Ctrl+B)')
    expect(html).toContain('斜体 (Cmd/Ctrl+I)')
    expect(html).toContain('下划线 (Cmd/Ctrl+U)')
    expect(html).toContain('删除线')
    expect(html).toContain('行内代码')
    expect(html).toContain('无序列表')
    expect(html).toContain('有序列表')
    expect(html).toContain('引用')
    expect(html).toContain('链接')
    // No active buttons yet.
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('marks bold + italic as active (aria-pressed)', () => {
    const html = renderWith({ bold: true, italic: true })
    expect(html).toContain('aria-pressed="true"')
    // Two active buttons.
    const activeCount = (html.match(/aria-pressed="true"/gu) ?? []).length
    expect(activeCount).toBe(2)
  })

  it('marks underline, strike and code as active together', () => {
    const html = renderWith({ underline: true, strike: true, code: true })
    const activeCount = (html.match(/aria-pressed="true"/gu) ?? []).length
    expect(activeCount).toBe(3)
  })

  it('marks bullet list, ordered list and blockquote as active', () => {
    const html = renderWith({ bulletList: true, orderedList: true, blockquote: true })
    const activeCount = (html.match(/aria-pressed="true"/gu) ?? []).length
    expect(activeCount).toBe(3)
  })

  it('marks link as active', () => {
    const html = renderWith({ link: true })
    const activeCount = (html.match(/aria-pressed="true"/gu) ?? []).length
    expect(activeCount).toBe(1)
  })

  it('marks every format active at once', () => {
    const html = renderWith({
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      code: true,
      bulletList: true,
      orderedList: true,
      blockquote: true,
      link: true,
    })
    const activeCount = (html.match(/aria-pressed="true"/gu) ?? []).length
    expect(activeCount).toBe(9)
  })

  it('disables every tool button when the disabled prop is set', () => {
    const html = renderWith({ bold: true }, true)
    // Nine tool buttons all carry disabled="".
    const disabledCount = (html.match(/disabled=""/gu) ?? []).length
    expect(disabledCount).toBe(9)
    // The bold button is still marked active even when disabled.
    expect(html).toContain('aria-pressed="true"')
  })

  it('renders tool dividers between the mark, list and link groups', () => {
    const html = renderWith({})
    // Two dividers separate the three button groups.
    const dividerCount = (html.match(/aria-hidden="true" class="mx-1 h-4 w-px/gu) ?? []).length
    expect(dividerCount).toBe(2)
  })
})
