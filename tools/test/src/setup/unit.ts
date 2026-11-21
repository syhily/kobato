import 'zod/compile'
import '@testing-library/jest-dom/vitest'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning'
import '@date-fns/tz'
import { cleanup } from '@testing-library/react'
import '@kobato/test/env'
import { afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

silenceLocalStorageWarning()

afterEach(() => {
  cleanup()
})

afterEach(() => {
  vi.useRealTimers()
})
