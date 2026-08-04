// @vitest-environment happy-dom

import type { SocialsSettings } from '@kobato/shared/config/types'

import { SocialsEditor } from '@kobato/ui/admin/settings/SocialsEditor'
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

const socials: SocialsSettings = {
  socials: [{ name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/example' }],
}

describe('SocialsEditor', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: socials })
  })

  it('commits social-link edits on blur with the section payload shape', async () => {
    render(<SocialsEditor socials={socials} />)

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
