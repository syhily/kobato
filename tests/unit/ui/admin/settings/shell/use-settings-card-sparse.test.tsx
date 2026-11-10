// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

// The whole-card commit is a SPARSE diff against the last acknowledged
// baseline: /admin/settings cards share their section with sibling cards and
// with other open tabs, so re-sending an untouched owned field would write this
// tab's stale copy over a value someone else has since changed.

const commit = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({ commit, isPending: false, status: 'idle' }),
}))

vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }))

interface PairSource {
  title: string
  other: string
}

interface PairState {
  title: string
  other: string
}

function pairProps(source: PairSource) {
  return {
    section: 'general' as const,
    source,
    toState: (s: PairSource): PairState => ({ title: s.title, other: s.other }),
    fromState: (state: PairState) => ({ title: state.title, other: state.other }),
  }
}

function PairHarness({ source, results }: { source: PairSource; results: boolean[] }) {
  const { form, flushOnBlur, flush } = useSettingsCard<PairSource, PairState>(pairProps(source))
  return (
    <div>
      <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
      <input aria-label="other" {...form.register('other')} onBlur={flushOnBlur} />
      <button
        type="button"
        onClick={() => {
          void flush().then((ok) => results.push(ok))
        }}
      >
        flush
      </button>
    </div>
  )
}

interface ListSource {
  keywords: string[]
  title: string
}

interface ListState {
  keywords: string[]
  title: string
}

function ListHarness({ source }: { source: ListSource }) {
  const { form, flushOnBlur } = useSettingsCard<ListSource, ListState>({
    section: 'general',
    source,
    toState: (s: ListSource): ListState => ({ keywords: [...s.keywords], title: s.title }),
    fromState: (state: ListState) => ({ keywords: state.keywords, title: state.title }),
  })
  return (
    <div>
      <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
      <button
        type="button"
        onClick={() => {
          // Same effect as a drag reorder's `field.onChange(next)`.
          form.setValue('keywords', ['b', 'a'])
        }}
      >
        reorder
      </button>
    </div>
  )
}

describe('useSettingsCard — sparse whole-card commit', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: {} })
    toastMock.error.mockReset()
  })

  it('posts only the fields that moved — untouched siblings stay out of the patch', async () => {
    render(wrapWithI18n(<PairHarness source={{ title: 'Hello', other: 'keep-me' }} results={[]} />))

    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), { target: { value: 'Changed' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'title' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ title: 'Changed' })
  })

  it('posts nothing when the form only differs before normalization', async () => {
    // `fromState` trims (the general identity card does): the raw edit differs,
    // the mapped value does not — nothing to persist, and the card must still
    // be acknowledged as clean or every flush would retry forever.
    function TrimHarness({ source }: { source: PairSource }) {
      const { form, flushOnBlur } = useSettingsCard<PairSource, PairState>({
        section: 'general',
        source,
        toState: (s: PairSource): PairState => ({ title: s.title, other: s.other }),
        fromState: (state: PairState) => ({ title: state.title.trim(), other: state.other }),
      })
      return <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
    }

    render(wrapWithI18n(<TrimHarness source={{ title: 'Hello', other: 'x' }} />))
    const title = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(title, { target: { value: '  Hello  ' } })
    fireEvent.blur(title)
    await new Promise((resolve) => setImmediate(resolve))
    expect(commit).not.toHaveBeenCalled()

    fireEvent.blur(title)
    await new Promise((resolve) => setImmediate(resolve))
    expect(commit).not.toHaveBeenCalled()
    expect(title).toHaveValue('  Hello  ')
  })

  it('never adopts response values it did not submit (no write-back of another tab’s field)', async () => {
    // The server answers with the whole section: `other` was changed by another
    // tab, `title` reflects this card's own save.
    commit.mockResolvedValueOnce({ ok: true, section: { title: 'Persisted', other: 'from-another-tab' } })
    render(wrapWithI18n(<PairHarness source={{ title: 'Hello', other: 'keep-me' }} results={[]} />))
    const title = screen.getByRole('textbox', { name: 'title' })
    const other = screen.getByRole('textbox', { name: 'other' })

    fireEvent.change(title, { target: { value: 'Persisted' } })
    fireEvent.blur(title)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ title: 'Persisted' })

    // The response's `other` never entered the form …
    expect(other).toHaveValue('keep-me')
    // … nor the baseline: a follow-up flush finds nothing to post instead of
    // pushing this tab's stale `other` back to the server.
    fireEvent.blur(other)
    await new Promise((resolve) => setImmediate(resolve))
    expect(commit).toHaveBeenCalledOnce()
  })

  it('carries a list reorder atomically alongside an unrelated edit', async () => {
    render(wrapWithI18n(<ListHarness source={{ keywords: ['a', 'b'], title: 'old' }} />))

    fireEvent.click(screen.getByRole('button', { name: 'reorder' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), { target: { value: 'new' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'title' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ keywords: ['b', 'a'], title: 'new' })
  })

  it('commits a reorder on its own when the next blur touches only a clean field', async () => {
    render(wrapWithI18n(<ListHarness source={{ keywords: ['a', 'b'], title: 'old' }} />))
    const title = screen.getByRole('textbox', { name: 'title' })

    fireEvent.click(screen.getByRole('button', { name: 'reorder' }))
    // List buttons never save directly — the next blur/flush owns the commit.
    expect(commit).not.toHaveBeenCalled()
    fireEvent.blur(title)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ keywords: ['b', 'a'] })
  })
})
