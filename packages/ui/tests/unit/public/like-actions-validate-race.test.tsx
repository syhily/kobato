// @vitest-environment happy-dom

import type { ValidateLikeTokenOutput } from '@kobato/shared/types/likes'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Behavioral pins for the LikeButton validate race: a slow background
// token validation must not overwrite a newer like/unlike interaction.
// The oRPC client is mocked at the same seam use-comments-actions.test.tsx
// uses; the mutations themselves run through real react-query.
const api = vi.hoisted(() => ({
  validate: vi.fn(),
  increase: vi.fn(),
  decrease: vi.fn(),
}))

vi.mock('@kobato/client/api/client', () => ({
  orpc: {
    likes: {
      validate: (input: unknown) => api.validate(input),
      increase: (input: unknown) => api.increase(input),
      decrease: (input: unknown) => api.decrease(input),
    },
  },
}))

// NumberFlow is presentation-only here; happy-dom doesn't fully implement
// the layout APIs it measures with.
vi.mock('@number-flow/react', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}))

import { LikeButton } from '@kobato/ui/public/LikeActions'

const PERMALINK = '/posts/hello'
const TOKENS_KEY = 'like-tokens'

// happy-dom doesn't implement localStorage; the component reads the bare
// global, so stub a Map-backed one per test (same pattern as
// admin-music-player-float.test.tsx).
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem(key: string) {
    return store.get(key) ?? null
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
  removeItem(key: string) {
    store.delete(key)
  },
  clear() {
    store.clear()
  },
} as unknown as Storage)

function readStoredTokens(): Record<string, string> {
  return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}') as Record<string, string>
}

function renderButton(likes = 5) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <LikeButton permalink={PERMALINK} commentKey="key-1" likes={likes} />
    </QueryClientProvider>,
  )
  return screen.getByRole('button', { name: '点赞' })
}

beforeEach(() => {
  api.validate.mockReset()
  api.increase.mockReset()
  api.decrease.mockReset()
  store.clear()
})

describe('LikeButton validate sequencing', () => {
  it('discards a late invalid verdict that returns after the user liked — button and new token survive', async () => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ [PERMALINK]: 'old-token' }))
    let resolveValidate!: (data: ValidateLikeTokenOutput) => void
    api.validate.mockImplementation(
      () =>
        new Promise<ValidateLikeTokenOutput>((resolve) => {
          resolveValidate = resolve
        }),
    )
    api.increase.mockResolvedValue({ key: 'key-1', likes: 6, token: 'new-token' })

    renderButton()
    // The mount effect fired the background validation for the stored token.
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith({ key: 'key-1', token: 'old-token' }))

    // The user likes while the validation is still in flight.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '点赞' }))
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '取消点赞' }).dataset.liked).toBe('true'))
    expect(readStoredTokens()[PERMALINK]).toBe('new-token')

    // The stale verdict arrives late — it must not flip the button back
    // or delete the freshly issued token.
    await act(async () => {
      resolveValidate({ key: 'key-1', valid: false })
    })
    expect(screen.getByRole('button', { name: '取消点赞' }).dataset.liked).toBe('true')
    expect(readStoredTokens()[PERMALINK]).toBe('new-token')
  })

  it('applies the verdict when no interaction intervenes (valid)', async () => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ [PERMALINK]: 'old-token' }))
    api.validate.mockResolvedValue({ key: 'key-1', valid: true })

    renderButton()
    await waitFor(() => expect(screen.getByRole('button', { name: '取消点赞' }).dataset.liked).toBe('true'))
    expect(readStoredTokens()[PERMALINK]).toBe('old-token')
  })

  it('applies the verdict when no interaction intervenes (invalid clears the stored token)', async () => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ [PERMALINK]: 'old-token' }))
    api.validate.mockResolvedValue({ key: 'key-1', valid: false })

    renderButton()
    await waitFor(() => expect(readStoredTokens()[PERMALINK]).toBeUndefined())
    expect(screen.getByRole('button', { name: '点赞' }).dataset.liked).toBe('false')
  })
})
