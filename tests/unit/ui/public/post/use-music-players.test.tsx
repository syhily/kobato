// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMusicPlayers } from '@/ui/public/post/use-music-players'

// The APlayer module is heavy (audio element wiring); stub the dynamic import
// target — the hook's contract is mount-point selection, fallback removal,
// and root lifecycle.
vi.mock('@/ui/public/aplayer/player', () => ({
  APlayer: ({ audio }: { audio: { url: string; name?: string } }) => (
    <div data-stub-player="" data-url={audio.url}>
      {audio.name}
    </div>
  ),
}))

function mountContainer(html: string): { container: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const ref = createRef<HTMLDivElement>()
  ;(ref as { current: HTMLDivElement | null }).current = container
  return { container, ref }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('useMusicPlayers', () => {
  it('replaces the static fallback with the real player on mount points carrying a URL', async () => {
    const { container, ref } = mountContainer(
      '<div class="aplayer" data-id="7" data-name="Song" data-url="https://cdn/x.mp3">' +
        '<div data-music-player-fallback=""><span>Song</span></div></div>',
    )

    await act(async () => {
      renderHook(() => useMusicPlayers(ref))
      await Promise.resolve()
    })

    const player = container.querySelector('[data-stub-player]')
    expect(player?.getAttribute('data-url')).toBe('https://cdn/x.mp3')
    expect(player?.textContent).toBe('Song')
    expect(container.querySelector('[data-music-player-fallback]')).toBeNull()
  })

  it('keeps the empty placeholder for mount points without a URL', async () => {
    const { container, ref } = mountContainer('<div class="aplayer" data-id="7"></div>')
    await act(async () => {
      renderHook(() => useMusicPlayers(ref))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-stub-player]')).toBeNull()
    expect(container.querySelector('.aplayer')).not.toBeNull()
  })

  it('no-ops when no mount points exist', () => {
    expect(() => renderHook(() => useMusicPlayers({ current: null }))).not.toThrow()
  })
})
