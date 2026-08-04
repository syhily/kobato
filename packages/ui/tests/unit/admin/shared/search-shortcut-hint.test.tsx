// @vitest-environment happy-dom

import { SearchShortcutHint } from '@kobato/ui/admin/shared/SearchShortcutHint'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

const originalPlatform = navigator.platform

function setNavigatorPlatform(platform: string): void {
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: platform,
  })
}

afterEach(() => {
  setNavigatorPlatform(originalPlatform)
})

describe('SearchShortcutHint', () => {
  it('hydrates without a recoverable error when the client is a Mac', async () => {
    setNavigatorPlatform('Linux x86_64')
    const serverHtml = renderToString(<SearchShortcutHint />)
    const container = document.createElement('div')
    container.innerHTML = serverHtml

    setNavigatorPlatform('MacIntel')
    const recoverableErrors: unknown[] = []
    let root: ReturnType<typeof hydrateRoot> | undefined

    await act(async () => {
      root = hydrateRoot(container, <SearchShortcutHint />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
      await Promise.resolve()
    })

    expect(recoverableErrors).toEqual([])
    expect(container).toHaveTextContent('⌘K')
    expect(container.querySelector('span')).toHaveAttribute('aria-label', '快捷键：Command K')

    await act(async () => root?.unmount())
  })
})
