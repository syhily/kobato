import { describe, expect, it } from 'vitest'

import type { NavigationItem } from '@/shared/config/types'

import { renderInRouter } from '#/_helpers/render'
import { Header } from '@/ui/public/chrome/Header'

describe('security / tabnabbing — Header external nav links', () => {
  it('adds noopener noreferrer to navigation links with target="_blank"', () => {
    const navigation: NavigationItem[] = [
      { text: 'external', link: 'https://example.com', target: '_blank' },
      { text: 'same tab', link: '/about' },
    ]
    const html = renderInRouter(
      <Header navigation={navigation} currentUser={null} pathname="/" logoutQuery="action=logout&redirect_to=%2F" />,
      '/',
    )
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('does not add a rel to same-tab navigation links', () => {
    const navigation: NavigationItem[] = [{ text: 'internal', link: '/about' }]
    const html = renderInRouter(
      <Header navigation={navigation} currentUser={null} pathname="/" logoutQuery="action=logout&redirect_to=%2F" />,
      '/',
    )
    expect(html).not.toContain('rel="noopener noreferrer"')
  })
})
