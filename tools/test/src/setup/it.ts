import 'zod/compile'
import '@kobato/test/env'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning'
import { afterEach, vi } from 'vitest'

silenceLocalStorageWarning()

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

afterEach(() => {
  vi.useRealTimers()
})
