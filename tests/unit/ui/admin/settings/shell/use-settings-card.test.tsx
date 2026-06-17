import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'

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
      section: 'general' as SettingsSection,
      source,
      toState: (s) => ({ title: s.title }),
      fromState: (state) => ({ title: state.title }),
    })
}

describe('ui/admin/settings/shell/useSettingsCard', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue(true)
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

  it('saves the derived patch merged with the source', async () => {
    const source: Source = { title: 'Hello', description: 'World' }
    const { form, save } = renderHook(makeHook(source))
    form.setValue('title', 'Updated')
    save()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    const [section, payload] = commit.mock.calls[0]!
    expect(section).toBe('general')
    expect(payload).toEqual({ title: 'Updated', description: 'World' })
  })

  it('does not mutate unrelated source fields', async () => {
    const source: Source = { title: 'Original', description: 'Keep' }
    const { form, save, display } = renderHook(makeHook(source))
    form.setValue('title', 'Changed')
    save()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(display).toEqual(source)
  })
})
