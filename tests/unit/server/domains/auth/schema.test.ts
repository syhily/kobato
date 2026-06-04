import { describe, expect, it } from 'vitest'

import { signUpAdminSchema } from '@/server/domains/auth/schema'

describe('auth/schema — password complexity', () => {
  const base = { title: 'Blog', name: 'Admin', email: 'admin@example.com' }

  it('accepts a password with uppercase, lowercase, and digit', async () => {
    const result = await signUpAdminSchema.parseAsync({ ...base, password: 'CorrectHorse1' })
    expect(result.password).toBe('CorrectHorse1')
  })

  it('rejects a password without an uppercase letter', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: 'correcthorse1' })).rejects.toBeTruthy()
  })

  it('rejects a password without a lowercase letter', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: 'CORRECTHORSE1' })).rejects.toBeTruthy()
  })

  it('rejects a password without a digit', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: 'CorrectHorse' })).rejects.toBeTruthy()
  })

  it('rejects a password shorter than 10 characters even with complexity', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: 'Ab1' })).rejects.toBeTruthy()
  })

  it('rejects an all-numeric password', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: '1234567890' })).rejects.toBeTruthy()
  })

  it('rejects a common weak password pattern', async () => {
    await expect(signUpAdminSchema.parseAsync({ ...base, password: 'password123' })).rejects.toBeTruthy()
  })
})
