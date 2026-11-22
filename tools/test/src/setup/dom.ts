import '@kobato/test/setup/node'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

afterEach(() => {
  cleanup()
})
