import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseHeaderNode } from '@/nodes/base/nodes/header/HeaderNode'
import type { HeaderNodeWriter } from '@/nodes/header/header-field-writer'

import { useHeaderBackgroundImage } from '@/hooks/useHeaderBackgroundImage'
import { getAccentColor } from '@/utils/getAccentColor'

vi.mock('@/utils/getAccentColor', () => ({
  getAccentColor: vi.fn(),
}))

interface PolicyProps {
  layout: string
  backgroundImageSrc: string
}

// capture each seam mutator's effect on a fresh node-shaped record, so the
// policy transitions assert as a synchronous table
function renderPolicy(initialProps: PolicyProps) {
  const applied: Array<Partial<BaseHeaderNode>> = []
  const write: HeaderNodeWriter = (update) => {
    const node: Partial<BaseHeaderNode> = {}
    update(node as BaseHeaderNode)
    applied.push(node)
  }
  const openFileDialog = vi.fn()
  const view = renderHook((props: PolicyProps) => useHeaderBackgroundImage({ write, openFileDialog, ...props }), {
    initialProps,
  })
  return { applied, openFileDialog, view }
}

describe('useHeaderBackgroundImage', () => {
  beforeEach(() => {
    // the default test page carries no accent color
    vi.mocked(getAccentColor).mockReturnValue('')
  })

  describe('mount', () => {
    it.each([
      ['img-a.png', true],
      ['', false],
    ])('derives the initial visibility from the node src (%s → %s)', (src, expected) => {
      const { view } = renderPolicy({ layout: 'full', backgroundImageSrc: src })

      expect(view.result.current.showBackgroundImage).toBe(expected)
    })

    it('backfills a present accent color into the node', () => {
      vi.mocked(getAccentColor).mockReturnValue('#ff0095')

      const { applied } = renderPolicy({ layout: 'full', backgroundImageSrc: '' })

      expect(applied).toEqual([{ accentColor: '#ff0095' }])
    })

    it('does not write when no accent color is present', () => {
      const { applied } = renderPolicy({ layout: 'full', backgroundImageSrc: '' })

      expect(applied).toEqual([])
    })
  })

  describe('showImage', () => {
    it('restores the remembered src through the write seam', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: 'img-a.png' })

      act(() => view.result.current.showImage())

      expect(view.result.current.showBackgroundImage).toBe(true)
      expect(applied).toEqual([{ backgroundImageSrc: 'img-a.png' }])
      expect(openFileDialog).not.toHaveBeenCalled()
    })

    it('opens the file dialog when there is no remembered src', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: '' })

      act(() => view.result.current.showImage())

      expect(view.result.current.showBackgroundImage).toBe(true)
      expect(applied).toEqual([])
      expect(openFileDialog).toHaveBeenCalledTimes(1)
    })
  })

  describe('hide vs clear', () => {
    it('hide clears the node src but keeps the restore path', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: 'img-a.png' })

      act(() => view.result.current.hideImage())
      expect(view.result.current.showBackgroundImage).toBe(false)

      act(() => view.result.current.showImage())

      expect(applied).toEqual([{ backgroundImageSrc: '' }, { backgroundImageSrc: 'img-a.png' }])
      expect(openFileDialog).not.toHaveBeenCalled()
    })

    it('clear marks the removal deliberate, so the next show opens the file dialog', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: 'img-a.png' })

      act(() => view.result.current.clearImage())
      act(() => view.result.current.showImage())

      expect(applied).toEqual([{ backgroundImageSrc: '' }])
      expect(openFileDialog).toHaveBeenCalledTimes(1)
    })
  })

  describe('imageApplied', () => {
    it('remembers the applied src and re-enables the restore path after a deliberate removal', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: '' })

      act(() => view.result.current.clearImage())
      act(() => view.result.current.imageApplied('img-b.png'))
      act(() => view.result.current.showImage())

      expect(applied).toEqual([{ backgroundImageSrc: '' }, { backgroundImageSrc: 'img-b.png' }])
      expect(openFileDialog).not.toHaveBeenCalled()
    })
  })

  describe('layout transitions', () => {
    it('re-derives visibility from the node src when switching to a non-split layout', () => {
      const { view } = renderPolicy({ layout: 'split', backgroundImageSrc: '' })

      act(() => view.result.current.showImage())
      expect(view.result.current.showBackgroundImage).toBe(true)

      view.rerender({ layout: 'full', backgroundImageSrc: '' })

      expect(view.result.current.showBackgroundImage).toBe(false)
    })

    it('re-runs the show transition when switching to split with no src but a remembered image', () => {
      const { applied, openFileDialog, view } = renderPolicy({ layout: 'full', backgroundImageSrc: 'img-a.png' })

      // the user hides the image (node src clears), then switches to split
      act(() => view.result.current.hideImage())
      view.rerender({ layout: 'full', backgroundImageSrc: '' })
      applied.length = 0

      view.rerender({ layout: 'split', backgroundImageSrc: '' })

      expect(view.result.current.showBackgroundImage).toBe(true)
      expect(applied).toEqual([{ backgroundImageSrc: 'img-a.png' }])
      expect(openFileDialog).not.toHaveBeenCalled()
    })

    it('does not re-run the show transition on a src change alone', () => {
      const { applied, view } = renderPolicy({ layout: 'full', backgroundImageSrc: '' })
      applied.length = 0

      // a new src arriving without a layout change leaves visibility untouched
      view.rerender({ layout: 'full', backgroundImageSrc: 'img-a.png' })

      expect(view.result.current.showBackgroundImage).toBe(false)
      expect(applied).toEqual([])
    })
  })
})
