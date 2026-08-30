import { describe, expect, it } from 'vitest'

import { signInSchema, signUpAdminSchema, updateUserSchema } from '@/server/domains/auth/schema'

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

describe('signInSchema', () => {
  it('accepts valid credentials', async () => {
    const data = await signInSchema.parseAsync({ email: 'admin@example.com', password: 'Password123' })
    expect(data.email).toBe('admin@example.com')
  })

  it('rejects an invalid email', async () => {
    await expect(signInSchema.parseAsync({ email: 'not-an-email', password: 'Password123' })).rejects.toBeTruthy()
  })

  it('rejects a missing password', async () => {
    await expect(signInSchema.parseAsync({ email: 'admin@example.com' })).rejects.toBeTruthy()
  })
})

describe('updateUserSchema', () => {
  const base = { userId: '1' }

  it('accepts a name patch', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, name: 'New' })
    expect(data.name).toBe('New')
  })

  it('rejects a bare userId patch — an absent optional key no longer flows through preprocess (Zod 4.5)', async () => {
    await expect(updateUserSchema.parseAsync(base)).rejects.toBeTruthy()
  })

  it('accepts an explicit empty-string link (normalised, counts as a provided field)', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, link: '' })
    expect(data).toEqual({ userId: '1', link: '' })
  })

  it('leaves undefined badgeTextColor unchanged', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, name: 'New' })
    expect(data.badgeTextColor).toBeUndefined()
  })

  it('normalises null badgeTextColor to null', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, badgeTextColor: null })
    expect(data.badgeTextColor).toBeNull()
  })

  it('normalises an empty string badgeTextColor to null', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, badgeTextColor: '' })
    expect(data.badgeTextColor).toBeNull()
  })

  it('normalises a whitespace-only badgeTextColor to null', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, badgeTextColor: '   ' })
    expect(data.badgeTextColor).toBeNull()
  })

  it('preserves a non-empty badgeTextColor', async () => {
    const data = await updateUserSchema.parseAsync({ ...base, badgeTextColor: '#ffffff' })
    expect(data.badgeTextColor).toBe('#ffffff')
  })
})
