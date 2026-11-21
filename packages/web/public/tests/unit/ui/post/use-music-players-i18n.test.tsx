// @vitest-environment happy-dom

import { renderHookWithI18n } from '@kobato/ui/tests/utils/i18n-render.tsx'
import { useMusicPlayers } from '@kobato/web-public/ui/post/use-music-players.tsx'
import { act } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  document.body.replaceChildren()
})

describe('useMusicPlayers i18n', () => {
  it('hydrates the real player with the root locale context', async () => {
    const html = '<div class="aplayer" data-name="Song" data-url="https://cdn/x.mp3"><div>Fallback</div></div>'
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const ref: RefObject<HTMLDivElement | null> = createRef<HTMLDivElement>()
    ;(ref as { current: HTMLDivElement | null }).current = container

    renderHookWithI18n(() => useMusicPlayers(ref, html), { locale: 'en-US' })
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).not.toContain('Fallback'))
    })

    expect(container.textContent).toContain('Song')
    expect(container.querySelector('button[aria-label="Play"]')).not.toBeNull()
  })
})
