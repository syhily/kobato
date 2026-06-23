// @vitest-environment happy-dom

// Regression tests for LinkPopover — the link create/edit/remove popover.
//
// Security-critical: this is the user-facing surface where a `javascript:`
// URL could enter the document. The popover must reject unsafe schemes
// before dispatching `TOGGLE_LINK_COMMAND` (defense-in-depth on top of the
// render-time `sanitizeUrl` that every renderer applies).
//
// These tests pin the current behaviour so the Phase 4 refactor (hook
// extraction, plugin shape unification) can't silently regress the
// URL-safety guard or the text-seeding behaviour.

import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { buildHeadlessArticleEditor, seedParagraph } from '#/_helpers/headless-editor'
import { LinkPopover } from '@/ui/inkling/editor/toolbar/LinkPopover'

function renderPopover(editor = buildHeadlessArticleEditor(), onClose = vi.fn()) {
  return render(<LinkPopover editor={editor} onClose={onClose} />)
}

describe('LinkPopover', () => {
  describe('rendering', () => {
    it('shows "insert link" title when no existing link is selected', () => {
      const editor = buildHeadlessArticleEditor()
      seedParagraph(editor, 'plain text')
      renderPopover(editor)
      expect(screen.getByText('插入链接')).toBeInTheDocument()
    })

    it('renders URL input with placeholder', () => {
      renderPopover()
      expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument()
    })

    it('renders the optional text input when creating a new link', () => {
      renderPopover()
      expect(screen.getByPlaceholderText('链接文字（可选）')).toBeInTheDocument()
    })

    it('renders insert / cancel buttons', () => {
      renderPopover()
      expect(screen.getByRole('button', { name: '插入' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    })
  })

  describe('URL validation (security-critical)', () => {
    it('rejects javascript: scheme and shows an error', () => {
      const editor = buildHeadlessArticleEditor()
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderPopover(editor)

      const input = screen.getByPlaceholderText('https://...')
      fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(screen.getByRole('alert')).toHaveTextContent('链接协议不被允许')
      // TOGGLE_LINK_COMMAND must NOT be dispatched for an unsafe URL.
      expect(dispatchSpy).not.toHaveBeenCalledWith(TOGGLE_LINK_COMMAND, expect.anything())
    })

    it('rejects data: scheme', () => {
      const editor = buildHeadlessArticleEditor()
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderPopover(editor)

      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'data:text/html,<script>alert(1)</script>' },
      })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(dispatchSpy).not.toHaveBeenCalledWith(TOGGLE_LINK_COMMAND, expect.anything())
    })

    it('rejects control-character-smuggled javascript:', () => {
      // `java\tscript:` is equivalent to `javascript:` in browsers after
      // control-char stripping. The guard must catch this pre-strip.
      const editor = buildHeadlessArticleEditor()
      renderPopover(editor)

      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'java\tscript:alert(1)' },
      })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it.each(['https://example.com', 'http://example.com', 'mailto:a@b.com', 'tel:+1234', '/relative/path', '#anchor'])(
      'accepts safe URL: %s',
      (url) => {
        const editor = buildHeadlessArticleEditor()
        const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
        renderPopover(editor)

        fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: url } })
        fireEvent.click(screen.getByRole('button', { name: '插入' }))

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(dispatchSpy).toHaveBeenCalledWith(
          TOGGLE_LINK_COMMAND,
          expect.objectContaining({ url: expect.any(String) }),
        )
      },
    )

    it('clears the error when the user edits the URL after a rejection', () => {
      const editor = buildHeadlessArticleEditor()
      renderPopover(editor)

      const input = screen.getByPlaceholderText('https://...')
      fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Typing a safe URL clears the error.
      fireEvent.change(input, { target: { value: 'https://safe.example.com' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('apply behaviour', () => {
    it('closes the popover after a successful apply', () => {
      const onClose = vi.fn()
      renderPopover(buildHeadlessArticleEditor(), onClose)

      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'https://example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when URL validation fails', () => {
      const onClose = vi.fn()
      renderPopover(buildHeadlessArticleEditor(), onClose)

      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'javascript:alert(1)' },
      })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(onClose).not.toHaveBeenCalled()
    })

    it('dispatches TOGGLE_LINK_COMMAND with target=_blank and safe rel', () => {
      const editor = buildHeadlessArticleEditor()
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderPopover(editor)

      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'https://example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: '插入' }))

      expect(dispatchSpy).toHaveBeenCalledWith(TOGGLE_LINK_COMMAND, {
        url: 'https://example.com',
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      })
    })
  })

  describe('keyboard', () => {
    it('applies on Enter', () => {
      const editor = buildHeadlessArticleEditor()
      const dispatchSpy = vi.spyOn(editor, 'dispatchCommand')
      renderPopover(editor)

      const input = screen.getByPlaceholderText('https://...')
      fireEvent.change(input, { target: { value: 'https://example.com' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(dispatchSpy).toHaveBeenCalledWith(
        TOGGLE_LINK_COMMAND,
        expect.objectContaining({ url: 'https://example.com' }),
      )
    })

    it('closes on Escape', () => {
      const onClose = vi.fn()
      renderPopover(buildHeadlessArticleEditor(), onClose)

      fireEvent.keyDown(screen.getByPlaceholderText('https://...'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('remove (existing link)', () => {
    it('does not render the remove button when there is no existing link', () => {
      renderPopover()
      expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument()
    })
  })
})

// Keep the act import used — fireEvent inside act avoids React state-update
// warnings for the controlled-input change handlers.
void act
