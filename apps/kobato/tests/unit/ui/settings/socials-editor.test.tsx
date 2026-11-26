// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import type { SocialsSettings } from '@kobato/settings/types'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SocialsEditor } from '@/ui/settings/SocialsEditor'

const commit = vi.fn()

const settingsMutation = await import('@/ui/settings/use-settings-mutation')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  resetStatus: vi.fn(),
  revalidate: vi.fn(),
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

const socials: SocialsSettings = {
  socials: [{ name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/example' }],
}

describe('SocialsEditor', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: socials })
  })

  it('commits social-link edits on blur with the section payload shape', async () => {
    renderUi(<SocialsEditor socials={socials} />)

    const input = screen.getByDisplayValue('https://github.com/example')
    fireEvent.change(input, { target: { value: 'https://github.com/updated' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit).toHaveBeenCalledWith(
      'socials',
      expect.objectContaining({
        socials: expect.arrayContaining([
          expect.objectContaining({ network: 'github', link: 'https://github.com/updated' }),
        ]),
      }),
    )
  })
})
