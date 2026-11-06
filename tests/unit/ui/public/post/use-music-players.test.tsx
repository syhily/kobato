// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { safeMediaSrc, useMusicPlayers } from '@/ui/public/post/use-music-players'

// The player module pulls in audio element wiring; stub the dynamic import
// target — the hook's contract is mount-point selection, fallback removal,
// attribute → props mapping, and root lifecycle.
vi.mock('@/ui/public/music-player/music-player', () => ({
  MusicPlayerCard: ({ url, name, cover, lrc }: { url: string; name?: string; cover?: string; lrc?: string }) => (
    <div data-stub-player="" data-url={url} data-cover={cover ?? ''} data-lrc={lrc ?? ''}>
      {name}
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

describe('safeMediaSrc', () => {
  it('accepts http(s) URLs and same-origin relative paths', () => {
    expect(safeMediaSrc('https://cdn.example/x.mp3')).toBe('https://cdn.example/x.mp3')
    expect(safeMediaSrc('http://cdn.example/x.mp3')).toBe('http://cdn.example/x.mp3')
    expect(safeMediaSrc('/storage/x.mp3')).toBe('/storage/x.mp3')
    expect(safeMediaSrc('  https://cdn.example/x.mp3  ')).toBe('https://cdn.example/x.mp3')
  })

  it('rejects every other scheme, protocol-relative paths, and empty values', () => {
    expect(safeMediaSrc('javascript:alert(1)')).toBeUndefined()
    expect(safeMediaSrc(' JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeMediaSrc('data:audio/mpeg;base64,AAAA')).toBeUndefined()
    expect(safeMediaSrc('blob:https://cdn.example/1')).toBeUndefined()
    expect(safeMediaSrc('//evil.example/x.mp3')).toBeUndefined()
    expect(safeMediaSrc('')).toBeUndefined()
    expect(safeMediaSrc('   ')).toBeUndefined()
    expect(safeMediaSrc(null)).toBeUndefined()
    expect(safeMediaSrc(undefined)).toBeUndefined()
    expect(safeMediaSrc('not-a-url')).toBeUndefined()
  })
})

describe('useMusicPlayers', () => {
  it('replaces the static fallback with the real player on mount points carrying a URL', async () => {
    const html =
      '<div class="aplayer" data-id="7" data-name="Song" data-url="https://cdn/x.mp3" data-cover="https://cdn/x.jpg" data-lrc="[00:01.00]hi">' +
      '<div data-music-player-fallback=""><span>Song</span></div></div>'
    const { container, ref } = mountContainer(html)

    await act(async () => {
      renderHook(() => useMusicPlayers(ref, html))
      await Promise.resolve()
    })

    const player = container.querySelector('[data-stub-player]')
    expect(player?.getAttribute('data-url')).toBe('https://cdn/x.mp3')
    expect(player?.getAttribute('data-cover')).toBe('https://cdn/x.jpg')
    expect(player?.getAttribute('data-lrc')).toBe('[00:01.00]hi')
    expect(player?.textContent).toBe('Song')
    expect(container.querySelector('[data-music-player-fallback]')).toBeNull()
  })

  it('keeps the empty placeholder for mount points without a URL', async () => {
    const { container, ref } = mountContainer('<div class="aplayer" data-id="7"></div>')
    await act(async () => {
      renderHook(() => useMusicPlayers(ref, '<div class="aplayer" data-id="7"></div>'))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-stub-player]')).toBeNull()
    expect(container.querySelector('.aplayer')).not.toBeNull()
  })

  it('no-ops when no mount points exist', () => {
    expect(() => renderHook(() => useMusicPlayers({ current: null }, ''))).not.toThrow()
  })

  it('skips a mount point whose data-url is not an http(s) / same-origin URL', async () => {
    const html =
      '<div class="aplayer" data-name="Bad" data-url="javascript:alert(1)">' +
      '<div data-music-player-fallback=""><span>Bad</span></div></div>' +
      '<div class="aplayer" data-name="ProtocolRelative" data-url="//evil.example/x.mp3"></div>'
    const { container, ref } = mountContainer(html)
    await act(async () => {
      renderHook(() => useMusicPlayers(ref, html))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-stub-player]')).toBeNull()
    // The sanitized static fallback stays in place instead of a live player.
    expect(container.querySelector('[data-music-player-fallback]')).not.toBeNull()
  })

  it('drops an unsafe data-cover but still hydrates the player', async () => {
    const html =
      '<div class="aplayer" data-name="Song" data-url="https://cdn/x.mp3" data-cover="javascript:alert(1)"></div>'
    const { container, ref } = mountContainer(html)
    await act(async () => {
      renderHook(() => useMusicPlayers(ref, html))
      await Promise.resolve()
    })
    const player = container.querySelector('[data-stub-player]')
    expect(player?.getAttribute('data-url')).toBe('https://cdn/x.mp3')
    expect(player?.getAttribute('data-cover')).toBe('')
  })

  it('scans the container for mount points rather than gating on a bodyHtml substring', async () => {
    const html = '<div class="aplayer" data-name="Song" data-url="https://cdn/x.mp3"></div>'
    const { container, ref } = mountContainer(html)
    await act(async () => {
      // The re-scan key intentionally carries no 'class="aplayer"' marker.
      renderHook(() => useMusicPlayers(ref, 'rescan-key'))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-stub-player]')?.getAttribute('data-url')).toBe('https://cdn/x.mp3')
  })

  it('unmounts the old player and upgrades the new mount points when bodyHtml changes (client-side navigation)', async () => {
    const htmlA =
      '<div class="aplayer" data-name="Old" data-url="https://cdn/old.mp3">' +
      '<div data-music-player-fallback=""><span>Old</span></div></div>'
    const htmlB =
      '<div class="aplayer" data-name="New" data-url="https://cdn/new.mp3">' +
      '<div data-music-player-fallback=""><span>New</span></div></div>'
    const { container, ref } = mountContainer(htmlA)

    let rerender: (props: { html: string }) => void
    await act(async () => {
      ;({ rerender } = renderHook(({ html }) => useMusicPlayers(ref, html), { initialProps: { html: htmlA } }))
      await Promise.resolve()
    })
    expect(container.querySelector('[data-stub-player]')?.getAttribute('data-url')).toBe('https://cdn/old.mp3')

    // Client-side navigation swaps the container's innerHTML while the div
    // itself (and the ref) is reused — the hook must re-scan on the new key.
    container.innerHTML = htmlB
    await act(async () => {
      rerender({ html: htmlB })
      await Promise.resolve()
    })

    const player = container.querySelector('[data-stub-player]')
    expect(player?.getAttribute('data-url')).toBe('https://cdn/new.mp3')
    expect(player?.textContent).toBe('New')
    // Exactly one live player: the old root was unmounted, not left playing
    // on its detached node.
    expect(container.querySelectorAll('[data-stub-player]')).toHaveLength(1)
  })
})
