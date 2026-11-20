// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { wrapWithI18n } from '@kobato/web-admin/tests/utils/i18n-render.tsx'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card.tsx'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.fn()

const settingsMutation = await import('@kobato/web-admin/ui/settings/use-settings-mutation.ts')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  resetStatus: vi.fn(),
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

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
    renderUi(<Harness source={{ title: 'Hello', description: 'World' }} />)
    expect(screen.getByTestId('display-title').textContent).toBe('Hello')

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByTestId('display-title').textContent).toBe('Server Merged'))
  })
})
