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

  it('commits a changed trigram threshold as a focused search patch', async () => {
    render(<SearchForm search={search} />)

    const input = screen.getByLabelText('三元组相似度阈值')
    fireEvent.change(input, { target: { value: '0.8' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // The card posts only the fields it owns; the server merges them into
    // the stored row (persistence of untouched fields is covered
    // server-side by the section-patch merge tests).
    expect(commit).toHaveBeenCalledWith('search', {
      search: { enabled: false, mode: 'trgm', trgmThreshold: 0.8 },
    })
  })

  it('commits the OpenAI card as a focused search patch', async () => {
    render(<SearchForm search={search} />)

    const input = screen.getByLabelText('相似度阈值')
    fireEvent.change(input, { target: { value: '0.75' } })
    fireEvent.blur(input)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // An empty API key input is omitted so the stored key survives.
    expect(commit).toHaveBeenCalledWith('search', {
      search: { endpoint: '', model: 'text-embedding-3-small', similarityThreshold: 0.75 },
    })
  })
})
