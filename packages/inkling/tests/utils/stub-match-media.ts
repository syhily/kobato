import { vi } from 'vitest'

export function stubMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    configurable: true,
    writable: true,
  })
}
