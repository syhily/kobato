// @vitest-environment happy-dom

// Comprehensive regression tests for InklingPlusMenuPlugin — the `+` button
// that opens a card-insert menu.
//
// The button follows the caret's paragraph (Koenig behaviour): it only shows
// when the caret sits at the very start of a top-level block (empty
// paragraph, or caret before all text), and hides once the user types. These
// tests pin:
//   1. Button rendering + aria attributes when the caret is at a block start.
//   2. The button is ABSENT when the caret is mid-paragraph (after text).
//   3. Open/close toggle via mouseDown.
//   4. Article-mode card options (all 8 types + section headers).
//   5. Mode filtering (comment shows only code + math).
//   6. Insert closes the menu.

import type { LexicalEditor } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'

import { InklingPlusMenuPlugin } from '@/ui/inkling/editor/menu/PlusMenu'
import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'

afterEach(() => {
  cleanup()
})

function EditorCapture({ holder }: { holder: { current: LexicalEditor | null } }) {
  const [editor] = useLexicalComposerContext()
  holder.current = editor
  return null
}

function renderPlusMenu(mode: 'article' | 'comment' = 'article') {
  const holder: { current: LexicalEditor | null } = { current: null }
  render(
    <LexicalComposer
      initialConfig={{
        namespace: 'inkling-plus-menu-test',
        theme: {},
        nodes: ARTICLE_NODES,
        onError: (e: Error) => {
          throw e
        },
      }}
    >
      <ContentEditable />
      <EditorCapture holder={holder} />
      <InklingPlusMenuPlugin mode={mode} />
    </LexicalComposer>,
  )
  return holder
}

/**
 * Drive the editor into a state where the caret is at the start of the
 * (empty) first paragraph, then fire SELECTION_CHANGE_COMMAND so the
 * PlusMenu's selection listener sets its anchor. A freshly-mounted Lexical
 * editor already has an empty paragraph; we select its start inside a
 * `discrete` update (forces a synchronous commit so the selection is
 * visible to the command handler's read), then notify.
 */
function caretAtEmptyParagraphStart(editor: LexicalEditor) {
  act(() => {
    editor.update(
      () => {
        const firstChild = $getRoot().getFirstChild()
        // The first child of an empty editor is a ParagraphNode (ElementNode),
        // which exposes `select()`. Guarded so the cast is sound.
        if (firstChild !== null && $isElementNode(firstChild)) {
          firstChild.select(0, 0)
        }
      },
      { discrete: true },
    )
    editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined)
  })
}

/**
 * Drive the editor so the caret is mid-paragraph (after typed text), which
 * must hide the `+` button. Seeds a paragraph with text and places the
 * caret at the end (offset 9 — past the paragraph start).
 */
function caretMidParagraph(editor: LexicalEditor) {
  act(() => {
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const p = $createParagraphNode()
        p.append($createTextNode('some text'))
        root.append(p)
        const textNode = p.getFirstChild()
        if (textNode !== null && $isTextNode(textNode)) {
          textNode.select(9, 9)
        }
      },
      { discrete: true },
    )
    editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined)
  })
}

describe('InklingPlusMenuPlugin', () => {
  describe('button visibility', () => {
    it('shows the `+` button when the caret is at an empty paragraph start', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      const button = screen.getByRole('button', { name: '插入卡片' })
      expect(button).toBeInTheDocument()
      // The button renders a lucide PlusIcon (an inline SVG), not a literal
      // `+` glyph. Asserting the icon presence keeps this test honest about
      // what the button actually contains.
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('hides the `+` button when the caret is mid-paragraph (after text)', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretMidParagraph(holder.current)
      }
      expect(screen.queryByRole('button', { name: '插入卡片' })).not.toBeInTheDocument()
    })

    it('reports aria-expanded=false when closed', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('reports aria-haspopup=true', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-haspopup', 'true')
    })
  })

  describe('open / close', () => {
    it('does not render the menu before the button is clicked', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('opens the menu on button mousedown and flips aria-expanded', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByRole('listbox', { name: '卡片菜单' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('closes the menu when the button is clicked again', () => {
      const holder = renderPlusMenu()
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      const button = screen.getByRole('button', { name: '插入卡片' })
      fireEvent.mouseDown(button)
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      fireEvent.mouseDown(button)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(button).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('card options (article mode)', () => {
    it('lists all article-mode card options when open', () => {
      const holder = renderPlusMenu('article')
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByText('图片')).toBeInTheDocument()
      expect(screen.getByText('代码块')).toBeInTheDocument()
      expect(screen.getByText('公式块')).toBeInTheDocument()
      expect(screen.getByText('音乐')).toBeInTheDocument()
      expect(screen.getByText('表格')).toBeInTheDocument()
      expect(screen.getByText('解答块')).toBeInTheDocument()
      expect(screen.getByText('双栏')).toBeInTheDocument()
      expect(screen.getByText('分隔线')).toBeInTheDocument()
    })

    it('renders section header labels', () => {
      const holder = renderPlusMenu('article')
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByText('媒体')).toBeInTheDocument()
      expect(screen.getByText('富文本')).toBeInTheDocument()
      expect(screen.getByText('布局')).toBeInTheDocument()
      expect(screen.getByText('结构')).toBeInTheDocument()
    })

    it('marks each option with role=option', () => {
      const holder = renderPlusMenu('article')
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      const options = screen.getAllByRole('option')
      expect(options.length).toBeGreaterThan(0)
    })
  })

  describe('mode filtering (comment mode)', () => {
    it('shows only code + math in comment mode', () => {
      const holder = renderPlusMenu('comment')
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByText('代码块')).toBeInTheDocument()
      expect(screen.getByText('公式块')).toBeInTheDocument()
      // Article-only cards must be absent.
      expect(screen.queryByText('图片')).not.toBeInTheDocument()
      expect(screen.queryByText('音乐')).not.toBeInTheDocument()
      expect(screen.queryByText('表格')).not.toBeInTheDocument()
      expect(screen.queryByText('解答块')).not.toBeInTheDocument()
      expect(screen.queryByText('双栏')).not.toBeInTheDocument()
      expect(screen.queryByText('分隔线')).not.toBeInTheDocument()
    })
  })

  describe('insert', () => {
    it('closes the menu after an option is picked', () => {
      const holder = renderPlusMenu('article')
      if (holder.current !== null) {
        caretAtEmptyParagraphStart(holder.current)
      }
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      fireEvent.mouseDown(screen.getByText('分隔线'))
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })
})
