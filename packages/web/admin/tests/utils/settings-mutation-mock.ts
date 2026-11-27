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
