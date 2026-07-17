// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchLoaderShape } from '@/shared/config/projection'

import { SearchForm } from '@/ui/admin/settings/SearchForm'

const commit = vi.fn()

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const search: SearchLoaderShape = {
  search: {
    enabled: false,
    mode: 'trgm',
    endpoint: '',
    apiKey: '',
    model: 'text-embedding-3-small',
    similarityThreshold: 0.5,
    trgmThreshold: 0.3,
  },
  apiKeyMask: null,
}

describe('SearchForm', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue(true)
  })

  it('commits a changed trigram threshold inside the nested search settings', async () => {
    render(<SearchForm search={search} />)

    const input = screen.getByLabelText('三元组相似度阈值')
    fireEvent.change(input, { target: { value: '0.8' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({
        search: expect.objectContaining({ trgmThreshold: 0.8 }),
      }),
    )
    expect(commit.mock.calls[0]?.[1]).not.toHaveProperty('trgmThreshold')
    expect(commit.mock.calls[0]?.[1]).not.toHaveProperty('search.apiKey')
  })

  it('uses the same nested settings shape for the OpenAI search card', async () => {
    render(<SearchForm search={search} />)

    const input = screen.getByLabelText('相似度阈值')
    fireEvent.change(input, { target: { value: '0.75' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({
        search: expect.objectContaining({ similarityThreshold: 0.75 }),
      }),
    )
    expect(commit.mock.calls[0]?.[1]).not.toHaveProperty('similarityThreshold')
    expect(commit.mock.calls[0]?.[1]).not.toHaveProperty('search.apiKey')
  })
})
