import type { NavigationItem } from '@kobato/settings/types.ts'

import { renderInRouter } from '@kobato/web-client/tests/utils/render.tsx'
import { Header } from '@kobato/web-public/ui/chrome/Header.tsx'
import { describe, expect, it } from 'vitest'

describe('security / tabnabbing — Header external nav links', () => {
  it('adds noopener noreferrer to navigation links with target="_blank"', () => {
    const navigation: NavigationItem[] = [
      { text: 'external', link: 'https://example.com', target: '_blank' },
      { text: 'same tab', link: '/about' },
    ]
    const html = renderInRouter(
      <Header
        navigation={navigation}
        currentUser={null}
        pathname="/"
        logoutRedirectTo="/"
        unreadCount={0}
        onOpenNotifications={() => {}}
      />,
      '/',
    )
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('does not add a rel to same-tab navigation links', () => {
    const navigation: NavigationItem[] = [{ text: 'internal', link: '/about' }]
    const html = renderInRouter(
      <Header
        navigation={navigation}
        currentUser={null}
        pathname="/"
        logoutRedirectTo="/"
        unreadCount={0}
        onOpenNotifications={() => {}}
      />,
      '/',
    )
    expect(html).not.toContain('rel="noopener noreferrer"')
  })
})
