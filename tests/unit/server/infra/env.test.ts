import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createEnv } from '@/server/infra/env'

describe('createEnv', () => {
  it('parses valid environment variables', () => {
    const env = createEnv({
      server: {
        HOST: z.string().default('0.0.0.0'),
        PORT: z.coerce.number().int().default(4321),
      },
      runtimeEnv: { HOST: '127.0.0.1', PORT: '8080' },
    })

    expect(env.HOST).toBe('127.0.0.1')
    expect(env.PORT).toBe(8080)
  })

  it('applies defaults when variables are missing', () => {
    const env = createEnv({
      server: {
        HOST: z.string().default('0.0.0.0'),
        PORT: z.coerce.number().int().default(4321),
      },
      runtimeEnv: {},
    })

    expect(env.HOST).toBe('0.0.0.0')
    expect(env.PORT).toBe(4321)
  })

  it('throws on validation errors with descriptive issues', () => {
    expect(() =>
      createEnv({
        server: {
          DATABASE_URL: z.url(),
        },
        runtimeEnv: { DATABASE_URL: 'not-a-url' },
      }),
    ).toThrow('Invalid environment variables')
  })

  it('calls custom onValidationError when provided', () => {
    const onValidationError = vi.fn((issues): never => {
      throw new Error(`Custom: ${issues[0]?.message}`)
    })

    expect(() =>
      createEnv({
        server: {
          REQUIRED: z.string().min(1),
        },
        runtimeEnv: {},
        onValidationError,
      }),
    ).toThrow('Custom: Invalid input: expected string, received undefined')

    expect(onValidationError).toHaveBeenCalledTimes(1)
    const issues = onValidationError.mock.calls[0]![0]
    expect(issues[0]).toMatchObject({
      message: 'Invalid input: expected string, received undefined',
      path: ['REQUIRED'],
    })
  })

  it('treats empty strings as undefined when emptyStringAsUndefined is true', () => {
    const env = createEnv({
      server: {
        OPTIONAL: z.string().optional().default('fallback'),
      },
      runtimeEnv: { OPTIONAL: '' },
      emptyStringAsUndefined: true,
    })

    expect(env.OPTIONAL).toBe('fallback')
  })

  it('keeps empty strings when emptyStringAsUndefined is false', () => {
    const env = createEnv({
      server: {
        OPTIONAL: z.string().optional().default('fallback'),
      },
      runtimeEnv: { OPTIONAL: '' },
      emptyStringAsUndefined: false,
    })

    // Zod .optional().default() with empty string: empty string is a valid string
    // so it doesn't fall through to default
    expect(env.OPTIONAL).toBe('')
  })

  it('skips validation when skipValidation is true', () => {
    const env = createEnv({
      server: {
        REQUIRED: z.string().min(1),
      },
      runtimeEnv: {},
      skipValidation: true,
    })

    expect(env.REQUIRED).toBeUndefined()
  })

  it('applies Zod transforms', () => {
    const env = createEnv({
      server: {
        SESSION_SECRET: z
          .string()
          .min(1)
          .transform((val) => val.split(',').map((s) => s.trim())),
      },
      runtimeEnv: { SESSION_SECRET: 'a, b, c' },
    })

    expect(env.SESSION_SECRET).toEqual(['a', 'b', 'c'])
  })

  it('collects multiple validation errors', () => {
    const onValidationError = vi.fn((issues): never => {
      throw new Error(`${issues.length} issues`)
    })

    expect(() =>
      createEnv({
        server: {
          A: z.string().min(1),
          B: z.number().int(),
        },
        runtimeEnv: {},
        onValidationError,
      }),
    ).toThrow('2 issues')

    expect(onValidationError.mock.calls[0]![0]).toHaveLength(2)
  })
})
