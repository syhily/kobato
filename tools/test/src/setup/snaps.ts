import 'zod/compile'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning'
import '@kobato/test/env'
import { afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

silenceLocalStorageWarning()

afterEach(() => {
  vi.useRealTimers()
})
