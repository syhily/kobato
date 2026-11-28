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

describe('SocialsEditor — focus retention across revalidates', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: socials })
  })

  it('keeps focus when a revalidate delivers an identical snapshot', () => {
    const { rerender } = renderUi(<SocialsEditor socials={socials} />)

    const input = screen.getByDisplayValue('https://github.com/example') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)

    rerender(wrapWithI18n(<SocialsEditor socials={structuredClone(socials)} />))

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('https://github.com/example')
  })

  it('keeps focus when the revalidate after this card’s own save lands', async () => {
    const { rerender } = renderUi(<SocialsEditor socials={socials} />)

    const input = screen.getByDisplayValue('https://github.com/example') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'https://github.com/exampleX' } })
    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())

    input.focus()
    expect(document.activeElement).toBe(input)
    rerender(
      wrapWithI18n(
        <SocialsEditor
          socials={{
            socials: [{ name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/exampleX' }],
          }}
        />,
      ),
    )

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('https://github.com/exampleX')
  })
})
