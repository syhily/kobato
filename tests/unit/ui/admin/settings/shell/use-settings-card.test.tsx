import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

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

  it('commits the fromState patch verbatim (the server owns the merge)', async () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form, save } = renderHook(makeHook(source))
    form.setValue('title', 'Updated')
    save()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    const [section, payload] = commit.mock.calls[0]!
    expect(section).toBe('general')
    // Honest Section patch: only the fields this card owns.
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

  // The dirty→commit path is exercised end-to-end by the snapshot form
  // tests that render the full card tree; here we cover the no-op guards.

  it('flushOnBlur is a no-op when the form is clean', () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { flushOnBlur } = renderHook(makeHook(source))
    flushOnBlur()
    flushOnBlur() // panel-level flush registry invokes the same callback
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not auto-save on change (debounce removed)', async () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form } = renderHook(makeHook(source))
    form.setValue('title', 'Typed')
    // Wait past any debounce window — saves fire only from save()/flushOnBlur()/flush().
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(commit).not.toHaveBeenCalled()
  })
})
