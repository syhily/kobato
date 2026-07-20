// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

const commit = vi.fn()

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    resetStatus: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

interface Source {
  title: string
  description: string
}

interface State {
  title: string
}

function Harness({ source }: { source: Source }) {
  const { form, save, display } = useSettingsCard<Source, State>({
    section: 'general',
    source,
    toState: (s) => ({ title: s.title }),
    fromState: (state) => ({ title: state.title }),
  })
  return (
    <div>
      <output data-testid="display-title">{display.title}</output>
      <button
        type="button"
        onClick={() => {
          form.setValue('title', 'Typed', { shouldDirty: true })
          save()
        }}
      >
        save
      </button>
    </div>
  )
}

describe('useSettingsCard — response-authoritative display', () => {
  beforeEach(() => {
    commit.mockReset()
  })

  it('adopts the save response as the new display baseline (no client-side projection)', async () => {
    commit.mockResolvedValue({ ok: true, section: { title: 'Server Merged', description: 'World' } })
    render(<Harness source={{ title: 'Hello', description: 'World' }} />)
    expect(screen.getByTestId('display-title').textContent).toBe('Hello')

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // The server merged 'Typed' into the stored row and returned the
    // result — display follows the RESPONSE, not a local projection.
    await waitFor(() => expect(screen.getByTestId('display-title').textContent).toBe('Server Merged'))
  })
})
