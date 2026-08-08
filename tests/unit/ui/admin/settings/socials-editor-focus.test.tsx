// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// Regression: a revalidate delivers a new snapshot identity; the reseed
// must skip `reset()` when it maps to the same form state, or useFieldArray
// regenerates ids and the focused input loses focus.
describe('SocialsEditor — focus retention across revalidates', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: socials })
  })

  it('keeps focus when a revalidate delivers an identical snapshot', () => {
    const { rerender } = render(<SocialsEditor socials={socials} />)

    const input = screen.getByDisplayValue('https://github.com/example') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)

    rerender(<SocialsEditor socials={structuredClone(socials)} />)

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('https://github.com/example')
  })

  it('keeps focus when the revalidate after this card’s own save lands', async () => {
    const { rerender } = render(<SocialsEditor socials={socials} />)

    const input = screen.getByDisplayValue('https://github.com/example') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'https://github.com/exampleX' } })
    fireEvent.blur(input) // blur-driven flush commits the edit
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())

    // Revalidate delivers the just-saved content with a new snapshot identity.
    input.focus()
    expect(document.activeElement).toBe(input)
    rerender(
      <SocialsEditor
        socials={{
          socials: [{ name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/exampleX' }],
        }}
      />,
    )

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('https://github.com/exampleX')
  })
})
