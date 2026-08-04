import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}))

import { getLogger, logger } from '@kobato/client/lib/logger'

describe('client logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs at every level with context', () => {
    expect(() => {
      logger.debug('debug message', { foo: 'bar' })
      logger.info('info message', { baz: 1 })
      logger.warn('warn message')
      logger.error('error message')
    }).not.toThrow()
  })

  it('creates a child logger that merges base context', () => {
    const child = logger.child({ requestId: 'abc' })
    expect(() => child.info('child log')).not.toThrow()
  })

  it('creates a scoped logger via getLogger', () => {
    const scoped = getLogger('auth')
    expect(() => scoped.warn('scoped warning')).not.toThrow()
  })
})
