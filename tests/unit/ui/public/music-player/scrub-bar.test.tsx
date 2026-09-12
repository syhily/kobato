// @vitest-environment happy-dom

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScrubBar } from '@/ui/public/music-player/scrub-bar'

describe('ui/public/music-player/scrub-bar', () => {
  it('exposes slider semantics with the current percentage', () => {
    const { getByRole } = render(<ScrubBar ariaLabel="播放进度" value={0.4} onSeek={() => {}} />)
    const slider = getByRole('slider')
    expect(slider.getAttribute('aria-valuenow')).toBe('40')
    expect(slider.getAttribute('aria-label')).toBe('播放进度')
  })

  it('steps 5% on arrow keys and commits immediately', () => {
    const onSeek = vi.fn()
    const { getByRole } = render(<ScrubBar ariaLabel="播放进度" value={0.4} onSeek={onSeek} />)
    const slider = getByRole('slider')

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(0.45)
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onSeek).toHaveBeenLastCalledWith(0.35)
  })

  it('jumps to the edges on Home/End', () => {
    const onSeek = vi.fn()
    const { getByRole } = render(<ScrubBar ariaLabel="音量" value={0.4} onSeek={onSeek} />)
    const slider = getByRole('slider')

    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onSeek).toHaveBeenLastCalledWith(1)
  })

  it('clamps keyboard steps to 0..1', () => {
    const onSeek = vi.fn()
    const { getByRole } = render(<ScrubBar ariaLabel="音量" value={0.98} onSeek={onSeek} />)
    fireEvent.keyDown(getByRole('slider'), { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(1)
  })

  it('ignores unrelated keys', () => {
    const onSeek = vi.fn()
    const { getByRole } = render(<ScrubBar ariaLabel="音量" value={0.5} onSeek={onSeek} />)
    fireEvent.keyDown(getByRole('slider'), { key: 'a' })
    expect(onSeek).not.toHaveBeenCalled()
  })
})
