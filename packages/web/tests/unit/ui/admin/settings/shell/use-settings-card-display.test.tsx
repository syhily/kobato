// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { wrapWithI18n } from '@kobato/test-helpers/i18n-render.tsx'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// These forms read `useI18n()`; mount the root provider for every RTL render.
function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import { useSettingsCard } from '@kobato/web/ui/admin/settings/shell/useSettingsCard.tsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.fn()

vi.mock('@kobato/web/ui/admin/settings/useSettingsMutation.ts', () => ({
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
    renderUi(<Harness source={{ title: 'Hello', description: 'World' }} />)
    expect(screen.getByTestId('display-title').textContent).toBe('Hello')

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // The server merged 'Typed' into the stored row and returned the
    // result — display follows the RESPONSE, not a local projection.
    await waitFor(() => expect(screen.getByTestId('display-title').textContent).toBe('Server Merged'))
  })
})
