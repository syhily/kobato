// @vitest-environment happy-dom

// Comprehensive regression tests for InklingPlusMenuPlugin — the `+` button
// that opens a card-insert menu.
//
// Pins:
//   1. Button rendering with correct aria attributes.
//   2. Open/close toggle via mouseDown.
//   3. Article-mode card options (all 8 types + section headers).
//   4. Mode filtering (comment shows only code + math).
//   5. Insert closes the menu.

import type { LexicalEditor } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('InklingPlusMenuPlugin', () => {
  describe('button', () => {
    it('renders the `+` button with aria-label and an icon', () => {
      renderPlusMenu()
      const button = screen.getByRole('button', { name: '插入卡片' })
      expect(button).toBeInTheDocument()
      // The button renders a lucide PlusIcon (an inline SVG), not a literal
      // `+` glyph. Asserting the icon presence keeps this test honest about
      // what the button actually contains.
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('reports aria-expanded=false when closed', () => {
      renderPlusMenu()
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('reports aria-haspopup=true', () => {
      renderPlusMenu()
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-haspopup', 'true')
    })
  })

  describe('open / close', () => {
    it('does not render the menu before the button is clicked', () => {
      renderPlusMenu()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('opens the menu on button mousedown and flips aria-expanded', () => {
      renderPlusMenu()
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByRole('listbox', { name: '卡片菜单' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '插入卡片' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('closes the menu when the button is clicked again', () => {
      renderPlusMenu()
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
      renderPlusMenu('article')
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
      renderPlusMenu('article')
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByText('媒体')).toBeInTheDocument()
      expect(screen.getByText('富文本')).toBeInTheDocument()
      expect(screen.getByText('布局')).toBeInTheDocument()
      expect(screen.getByText('结构')).toBeInTheDocument()
    })

    it('marks each option with role=option', () => {
      renderPlusMenu('article')
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      const options = screen.getAllByRole('option')
      expect(options.length).toBeGreaterThan(0)
    })
  })

  describe('mode filtering (comment mode)', () => {
    it('shows only code + math in comment mode', () => {
      renderPlusMenu('comment')
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
      renderPlusMenu('article')
      fireEvent.mouseDown(screen.getByRole('button', { name: '插入卡片' }))
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      fireEvent.mouseDown(screen.getByText('分隔线'))
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })
})
