import { vi } from 'vitest'

export function settingsMutationMock() {
  return {
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }
}

vi.mock('@/ui/settings/use-settings-mutation', async () => {
  const { settingsMutationMock } = await import('@tests/utils/settings-mutation-mock')
  return { useSettingsMutation: settingsMutationMock }
})
