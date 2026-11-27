import { renderHook } from '@kobato/ui/tests/utils/hook'
import { useSettingsCard } from '@kobato/web-admin/ui/settings/shell/use-settings-card'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.fn()

const settingsMutation = await import('@kobato/web-admin/ui/settings/use-settings-mutation')
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

interface Source {
  title: string
  description: string
}

interface State {
  title: string
}

function makeHook(source: Source) {
  return () =>
    useSettingsCard<Source, State>({
      section: 'general',
      source,
      toState: (s) => ({ title: s.title }),
      fromState: (state) => ({ title: state.title }),
    })
}

describe('ui/admin/settings/shell/useSettingsCard', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: {} })
  })

  it('seeds the form from the source', () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form, display, settingGroupProps } = renderHook(makeHook(source))
    expect(form.getValues()).toEqual({ title: 'Hello' })
    expect(display).toEqual(source)
    expect(settingGroupProps.saveState).toBe('idle')
  })

  it('reports the saving flag from the mutation', () => {
    const { isSaving } = renderHook(makeHook({ title: 'A', description: 'B' }))
    expect(isSaving).toBe(false)
  })

  it('posts only the owned fields that moved since the acknowledged baseline', async () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form, save } = renderHook(makeHook(source))
    form.setValue('title', 'Updated')
    save()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    const [section, payload] = commit.mock.calls[0]!
    expect(section).toBe('general')
    expect(payload).toEqual({ title: 'Updated' })
  })

  it('does not mutate unrelated source fields', async () => {
    const source: Source = { title: 'Original', description: 'Keep' }
    const { form, save, display } = renderHook(makeHook(source))
    form.setValue('title', 'Changed')
    save()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(display).toEqual(source)
  })

  it('flushOnBlur is a no-op when the form is clean', () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { flushOnBlur } = renderHook(makeHook(source))
    flushOnBlur()
    flushOnBlur()
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not auto-save on change (debounce removed)', async () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form } = renderHook(makeHook(source))
    form.setValue('title', 'Typed')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(commit).not.toHaveBeenCalled()
  })
})
