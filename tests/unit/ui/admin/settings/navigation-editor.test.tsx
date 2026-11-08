// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { wrapWithI18n } from '#/_helpers/i18n-render'

// These forms read `useI18n()`; mount the root provider for every RTL render.
function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavigationSettings } from '@/shared/config/types'

import { NavigationEditor } from '@/ui/admin/settings/NavigationEditor'

const commit = vi.fn()

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
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
    renderUi(<NavigationEditor navigation={navigation} socials={[]} />)

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
    renderUi(<NavigationEditor navigation={navigation} socials={[]} />)

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
