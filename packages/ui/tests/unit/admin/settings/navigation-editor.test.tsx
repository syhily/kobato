// @vitest-environment happy-dom

import type { NavigationSettings } from '@kobato/shared/config/types'

import { NavigationEditor } from '@kobato/ui/admin/settings/NavigationEditor'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.fn()

vi.mock('@kobato/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

const navigation: NavigationSettings = {
  navigation: {
    sideNav: [{ text: '首页', link: '/', target: '_blank' }],
    footerNav: [{ type: 'search' }],
  },
}

describe('NavigationEditor', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: navigation })
  })

  it('commits side-navigation text edits on blur with the nested payload shape', async () => {
    render(<NavigationEditor navigation={navigation} socials={[]} />)

    const input = screen.getByLabelText('显示文本')
    fireEvent.change(input, { target: { value: '文章' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit).toHaveBeenCalledWith(
      'navigation',
      expect.objectContaining({
        navigation: expect.objectContaining({
          sideNav: [{ text: '文章', link: '/', target: '_blank' }],
        }),
      }),
    )
  })

  it('commits side-navigation checkbox changes immediately', async () => {
    render(<NavigationEditor navigation={navigation} socials={[]} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '新窗口' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit).toHaveBeenCalledWith(
      'navigation',
      expect.objectContaining({
        navigation: expect.objectContaining({
          sideNav: [{ text: '首页', link: '/' }],
        }),
      }),
    )
  })
})
