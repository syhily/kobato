import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'
import type { MusicPlayerInitHost } from '@/ui/pt/blocks/MusicPlayer'

import { MusicPlayer, scheduleMusicPlayerInit } from '@/ui/pt/blocks/MusicPlayer'

describe('ui/mdx/music/MusicPlayer scheduler', () => {
  it('prefers requestIdleCallback so player hydration waits for critical image work', () => {
    let idleCallback: IdleRequestCallback | undefined
    const host: MusicPlayerInitHost = {
      requestIdleCallback: vi.fn((callback) => {
        idleCallback = callback
        return 1
      }),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(() => 2),
      clearTimeout: vi.fn(),
    }
    const task = vi.fn()

    scheduleMusicPlayerInit(task, host)

    expect(task).not.toHaveBeenCalled()
    expect(host.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2_000 })
    expect(host.setTimeout).not.toHaveBeenCalled()

    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 })
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('falls back to the next frame before scheduling the player task', () => {
    let frameCallback: FrameRequestCallback | undefined
    let timeoutCallback: (() => void) | undefined
    const host: MusicPlayerInitHost = {
      requestAnimationFrame: vi.fn((callback) => {
        frameCallback = callback
        return 1
      }),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn((callback) => {
        timeoutCallback = callback
        return 2
      }),
      clearTimeout: vi.fn(),
    }
    const task = vi.fn()

    scheduleMusicPlayerInit(task, host)

    expect(task).not.toHaveBeenCalled()
    expect(host.setTimeout).not.toHaveBeenCalled()

    frameCallback?.(0)
    expect(task).not.toHaveBeenCalled()
    expect(host.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0)

    timeoutCallback?.()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('cancels delayed player initialization on unmount', () => {
    let frameCallback: FrameRequestCallback | undefined
    const host: MusicPlayerInitHost = {
      requestAnimationFrame: vi.fn((callback) => {
        frameCallback = callback
        return 7
      }),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn(() => 8),
      clearTimeout: vi.fn(),
    }
    const task = vi.fn()

    const cancel = scheduleMusicPlayerInit(task, host)
    cancel()
    frameCallback?.(0)

    expect(host.cancelAnimationFrame).toHaveBeenCalledWith(7)
    expect(host.setTimeout).not.toHaveBeenCalled()
    expect(task).not.toHaveBeenCalled()
  })
})

describe('ui/pt/blocks/MusicPlayer', () => {
  const sampleMeta: MusicPlayerBlockMeta = {
    id: 'abcdefghijklmnop',
    name: 'Song Name',
    artist: 'Artist Name',
    cover: 'https://example.com/cover.jpg',
    audioUrl: 'https://example.com/audio.mp3',
    lyric: '[00:00.00]Lyric line',
  }

  it('renders from prerendered metadata without a client fetch', () => {
    const html = renderToString(<MusicPlayer meta={sampleMeta} auto alignment="center" />)
    expect(html).toContain('data-id="abcdefghijklmnop"')
    expect(html).toContain('aplayer')
  })

  it('renders a placeholder when metadata is missing', () => {
    const html = renderToString(<MusicPlayer id="legacy-id" alignment="start" />)
    expect(html).toContain('data-id="legacy-id"')
    expect(html).toContain('aplayer')
  })
})
