import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MathCard } from '@/components/ui/cards/MathCard'

describe('MathCard', function () {
  const svgArtifact = '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>'

  describe('display mode', function () {
    it('renders the stored artifact verbatim, sanitized', function () {
      const { container } = render(<MathCard svg={`${svgArtifact}<script>alert(1)</script>`} tex="x^2" />)

      const display = container.querySelector('[data-inkling-math-display="artifact"]')
      expect(display).not.toBeNull()
      expect(display!.innerHTML).toContain('<svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg>')
      expect(display!.innerHTML).not.toContain('<script')
    })

    it('prefers mathml over the tex fallback when no svg is stored', function () {
      const { container } = render(<MathCard mathml="<math><mi>x</mi></math>" tex="x^2" />)

      const display = container.querySelector('[data-inkling-math-display="artifact"]')
      expect(display!.innerHTML).toBe('<math><mi>x</mi></math>')
    })

    it('falls back to the tex source when no artifact is stored', function () {
      render(<MathCard tex="a < b" />)

      expect(screen.getByText('a < b')).toBeInTheDocument()
    })
  })

  describe('edit mode', function () {
    it('shows the tex source as the preview when the host has no renderMath channel', function () {
      render(<MathCard isEditing={true} tex="x^2" />)

      const preview = document.querySelector('[data-inkling-math-preview="tex"]')
      expect(preview).not.toBeNull()
      expect(preview!.textContent).toBe('x^2')
    })

    it('previews the host-rendered artifact when renderMath resolves one', async function () {
      const renderMath = vi.fn(() => Promise.resolve({ svg: svgArtifact }))
      render(<MathCard isEditing={true} renderMath={renderMath} tex="x^2" />)

      await waitFor(() => {
        const preview = document.querySelector('[data-inkling-math-preview="artifact"]')
        expect(preview).not.toBeNull()
        expect(preview!.innerHTML).toContain('<svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg>')
      })
      expect(renderMath).toHaveBeenCalledWith({ tex: 'x^2', display: true })
    })

    it('shows the host error when renderMath reports one', async function () {
      const renderMath = vi.fn(() => Promise.resolve({ error: 'KaTeX parse error' }))
      render(<MathCard isEditing={true} renderMath={renderMath} tex="\\bad" />)

      await waitFor(() => {
        expect(screen.getByText('KaTeX parse error')).toBeInTheDocument()
      })
    })

    it('calls updateTex when the tex input changes', function () {
      const updateTex = vi.fn()
      render(<MathCard isEditing={true} tex="x^2" updateTex={updateTex} />)

      fireEvent.change(screen.getByTestId('math-card-tex'), { target: { value: 'y^2' } })

      expect(updateTex).toHaveBeenCalledWith('y^2')
    })

    it('calls onEscape from the tex input', function () {
      const onEscape = vi.fn()
      render(<MathCard isEditing={true} tex="x^2" onEscape={onEscape} />)

      fireEvent.keyDown(screen.getByTestId('math-card-tex'), { key: 'Escape' })

      expect(onEscape).toHaveBeenCalledTimes(1)
    })
  })
})
