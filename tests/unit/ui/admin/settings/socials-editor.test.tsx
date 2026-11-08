// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { wrapWithI18n } from '#/_helpers/i18n-render'

// These forms read `useI18n()`; mount the root provider for every RTL render.
function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SocialsSettings } from '@/shared/config/types'

import { SocialsEditor } from '@/ui/admin/settings/SocialsEditor'

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
