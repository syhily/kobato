// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning.ts'
import '@kobato/test/env.ts'
import { afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

silenceLocalStorageWarning()

// Shared workers keep one event loop across files; restore timers after every
// test so no file can freeze a later file's timers/setImmediate.
afterEach(() => {
  vi.useRealTimers()
})
