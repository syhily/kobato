// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { wrapWithI18n } from '#/_helpers/i18n-render'

// These forms read `useI18n()`; mount the root provider for every RTL render.
function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import { useWatch } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'

const commit = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    isPending: false,
    status: 'idle',
  }),
}))

vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }))

interface Source {
  title: string
}

interface State {
  title: string
}

function makeCardProps(source: Source, schema?: z.ZodType<State, any>) {
  return {
    section: 'general' as const,
    source,
    schema,
    toState: (s: Source): State => ({ title: s.title }),
    fromState: (state: State) => ({ title: state.title }),
  }
}

// Two event-loop turns settle every pending microtask-driven save chain.
const settleSaveChains = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('useSettingsCard — schema-aware save baseline', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: {} })
    toastMock.error.mockReset()
  })

  it('stays clean after saving a value the schema trims — no repeat PATCH on later flushes', async () => {
    // The baseline stores raw values — parsed ones would keep the card permanently dirty.
    function Harness({ source }: { source: Source }) {
      const { form, flushOnBlur } = useSettingsCard<Source, State>(
        makeCardProps(source, z.object({ title: z.string().trim().min(1) })),
      )
      return <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
    }

    renderUi(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: '  Typed  ' } })
    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ title: 'Typed' })

    fireEvent.blur(input)
    await settleSaveChains()
    expect(commit).toHaveBeenCalledOnce()
  })

  it('keeps the invalid input and its error when validation rejects a whole-card save', async () => {
    function Harness({ source }: { source: Source }) {
      const { form, save } = useSettingsCard<Source, State>(
        makeCardProps(source, z.object({ title: z.string().min(1, '请填写站点标题') })),
      )
      return (
        <div>
          <input aria-label="title" {...form.register('title')} />
          <span data-testid="error">{form.formState.errors.title?.message ?? ''}</span>
          <button
            type="button"
            onClick={() => {
              void save()
            }}
          >
            save
          </button>
        </div>
      )
    }

    renderUi(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(toastMock.error.mock.calls[0]).toEqual(['设置未保存', { description: '请填写站点标题' }])
    expect(commit).not.toHaveBeenCalled()
    // A failed save never discards what the admin typed — the value and the
    // field error stay on screen so the failure is actionable.
    expect(input).toHaveValue('')
    expect(screen.getByTestId('error')).toHaveTextContent('请填写站点标题')
  })

  it('keeps the invalid input and its error through a blur-triggered flush', async () => {
    function Harness({ source }: { source: Source }) {
      const { form, flushOnBlur } = useSettingsCard<Source, State>(
        makeCardProps(source, z.object({ title: z.string().min(2, '太短') })),
      )
      return (
        <div>
          <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
          <span data-testid="error">{form.formState.errors.title?.message ?? ''}</span>
        </div>
      )
    }

    renderUi(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'A' } })
    fireEvent.blur(input)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(commit).not.toHaveBeenCalled()
    // Blur is how a locale pick starts (focus leaves the input first) — it must
    // not silently reset the invalid draft back to the committed baseline.
    expect(input).toHaveValue('A')
    expect(screen.getByTestId('error')).toHaveTextContent('太短')
  })

  it('localizes a custom issue through its own params bag ({label})', async () => {
    const schema = z.object({
      title: z.string().superRefine((value, ctx) => {
        if (value === 'bad') {
          ctx.addIssue({
            code: 'custom',
            message: 'admin.settings.assets.error.s3FieldRequired',
            params: { label: 'Bucket' },
          })
        }
      }),
    })
    function Harness({ source }: { source: Source }) {
      const { form, save } = useSettingsCard<Source, State>(makeCardProps(source, schema))
      return (
        <div>
          <input aria-label="title" {...form.register('title')} />
          <button
            type="button"
            onClick={() => {
              void save()
            }}
          >
            save
          </button>
        </div>
      )
    }

    renderUi(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    // The issue's `params` bag reaches localizeMessage — never the token name
    // and never the raw ICU template.
    expect(toastMock.error.mock.calls[0]).toEqual(['设置未保存', { description: '开启 S3 上传时「Bucket」必填' }])
    expect(input).toHaveValue('bad')
  })
})

interface ToggleSource {
  title: string
  enabled: boolean
}

interface ToggleState {
  title: string
  enabled: boolean
}

function makeToggleProps(source: ToggleSource, schema?: z.ZodType<ToggleState, any>) {
  return {
    section: 'general' as const,
    source,
    schema,
    toState: (s: ToggleSource): ToggleState => ({ title: s.title, enabled: s.enabled }),
    fromState: (state: ToggleState) => ({ title: state.title, enabled: state.enabled }),
  }
}

describe('useSettingsCard — field-scoped save (P1-13)', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: {} })
    toastMock.error.mockReset()
  })

  it('a switch save commits ONLY its own field — a sibling’s half-typed text never rides along', async () => {
    function Harness({ source }: { source: ToggleSource }) {
      const { form, save, flushOnBlur } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source))
      return (
        <div>
          <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
          <button
            type="button"
            onClick={() => {
              form.setValue('enabled', true)
              save('enabled')
            }}
          >
            toggle
          </button>
        </div>
      )
    }

    renderUi(<Harness source={{ title: 'Hello', enabled: false }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ enabled: true })

    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    // The switch's field commit already advanced `enabled`, so the whole-card
    // flush posts the text edit alone — never a full fromState re-send.
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Half typed' })
  })

  it('a rejected field save rolls back only the trigger field and preserves sibling edits', async () => {
    const schema = z.object({
      title: z.string(),
      enabled: z.boolean().refine((v) => v === false, '当前不允许开启'),
    })
    function Harness({ source }: { source: ToggleSource }) {
      const { form, save } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source, schema))
      return (
        <div>
          <input aria-label="title" {...form.register('title')} />
          <button
            type="button"
            onClick={() => {
              form.setValue('enabled', true)
              save('enabled')
            }}
          >
            toggle
          </button>
        </div>
      )
    }

    renderUi(<Harness source={{ title: 'Hello', enabled: false }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(toastMock.error.mock.calls[0]).toEqual(['设置未保存', { description: '当前不允许开启' }])
    expect(commit).not.toHaveBeenCalled()
    expect(input).toHaveValue('Half typed')
  })

  it('rolls a server-rejected field commit back to the committed value, and a later flush never re-posts it', async () => {
    function Harness({ source }: { source: ToggleSource }) {
      const { form, save, flushOnBlur } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source))
      const enabled = useWatch({ control: form.control, name: 'enabled' })
      return (
        <div>
          <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
          <output data-testid="enabled">{String(enabled)}</output>
          <button
            type="button"
            onClick={() => {
              form.setValue('enabled', true)
              void save('enabled')
            }}
          >
            toggle
          </button>
        </div>
      )
    }

    commit.mockResolvedValueOnce({ ok: false })
    renderUi(<Harness source={{ title: 'Hello', enabled: false }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ enabled: true })
    // The rejected value must never keep rendering as if it were persisted.
    await waitFor(() => expect(screen.getByTestId('enabled')).toHaveTextContent('false'))
    expect(input).toHaveValue('Half typed')

    // The next whole-card flush posts only what still differs from the
    // baseline: the rolled-back `enabled` equals it, so it is left out entirely.
    commit.mockResolvedValueOnce({ ok: true, section: {} })
    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Half typed' })
  })

  it('does not clobber a newer edit when the in-flight field commit is rejected', async () => {
    const gate = deferred<{ ok: false }>()
    function Harness({ source }: { source: ToggleSource }) {
      const { form, save } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source))
      const enabled = useWatch({ control: form.control, name: 'enabled' })
      return (
        <div>
          <output data-testid="enabled">{String(enabled)}</output>
          <button
            type="button"
            onClick={() => {
              form.setValue('enabled', true)
              void save('enabled')
            }}
          >
            toggle
          </button>
          <button
            type="button"
            onClick={() => {
              form.setValue('enabled', false)
            }}
          >
            re-edit
          </button>
        </div>
      )
    }

    commit.mockReturnValueOnce(gate.promise)
    renderUi(<Harness source={{ title: 'Hello', enabled: false }} />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // The admin flips the control back while the rejected request is in flight.
    fireEvent.click(screen.getByRole('button', { name: 're-edit' }))
    gate.resolve({ ok: false })
    await settleSaveChains()
    expect(screen.getByTestId('enabled')).toHaveTextContent('false')
  })

  it('a control that fired without moving its value commits nothing', async () => {
    function Harness({ source }: { source: ToggleSource }) {
      const { save } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source))
      return (
        <button
          type="button"
          onClick={() => {
            void save('enabled')
          }}
        >
          reselect
        </button>
      )
    }

    renderUi(<Harness source={{ title: 'Hello', enabled: false }} />)
    fireEvent.click(screen.getByRole('button', { name: 'reselect' }))
    await settleSaveChains()
    expect(commit).not.toHaveBeenCalled()
  })
})

interface TwoFieldSource {
  title: string
  other: string
}

interface TwoFieldState {
  title: string
  other: string
}

function makeTwoFieldProps(source: TwoFieldSource, schema?: z.ZodType<TwoFieldState, any>) {
  return {
    section: 'general' as const,
    source,
    schema,
    toState: (s: TwoFieldSource): TwoFieldState => ({ title: s.title, other: s.other }),
    fromState: (state: TwoFieldState) => ({ title: state.title, other: state.other }),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function FlushHarness({
  source,
  schema,
  results,
}: {
  source: TwoFieldSource
  schema?: z.ZodType<TwoFieldState, any>
  results: boolean[]
}) {
  const { form, save, flush, flushOnBlur } = useSettingsCard<TwoFieldSource, TwoFieldState>(
    makeTwoFieldProps(source, schema),
  )
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
      <button
        type="button"
        onClick={() => {
          form.setValue('other', 'scoped-value')
          void save('other')
        }}
      >
        save-other
      </button>
    </div>
  )
}

describe('useSettingsCard — awaitable flush + per-card serialization', () => {
  beforeEach(() => {
    commit.mockReset()
    commit.mockResolvedValue({ ok: true, section: {} })
    toastMock.error.mockReset()
  })

  it('resolves true for a clean card without posting', async () => {
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)

    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    await waitFor(() => expect(results).toEqual([true]))
    expect(commit).not.toHaveBeenCalled()
  })

  it('dedupes two concurrent flushes into a single POST', async () => {
    const gate = deferred<{ ok: true; section: unknown }>()
    commit.mockReturnValue(gate.promise)
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    gate.resolve({ ok: true, section: {} })
    await waitFor(() => expect(results).toEqual([true, true]))
    expect(commit).toHaveBeenCalledOnce()
  })

  it('waits for an in-flight field save, then commits the OTHER dirty field', async () => {
    const gate = deferred<{ ok: true; section: unknown }>()
    commit.mockReturnValueOnce(gate.promise)
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)

    // A control-triggered field save goes in flight…
    fireEvent.click(screen.getByRole('button', { name: 'save-other' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // …and the admin keeps editing another field.
    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), { target: { value: 'Typed' } })

    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    // The flush must not treat "field save succeeded" as "card is clean".
    expect(commit).toHaveBeenCalledOnce()

    gate.resolve({ ok: true, section: {} })
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    // Only the field that still differs from the baseline is posted.
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Typed' })
    commit.mockResolvedValue({ ok: true, section: {} })
    await waitFor(() => expect(results).toEqual([true]))
  })

  it('keeps a value typed DURING the save dirty and posts it on the next round', async () => {
    const first = deferred<{ ok: true; section: unknown }>()
    commit.mockReturnValueOnce(first.promise)
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())

    // Typed while the request is in flight — this input was NOT part of the POST.
    fireEvent.change(input, { target: { value: 'Second' } })
    first.resolve({ ok: true, section: {} })
    commit.mockResolvedValue({ ok: true, section: {} })

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    // Each POST carries only what moved since the acknowledged baseline.
    expect(commit.mock.calls[0]![1]).toEqual({ title: 'First' })
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Second' })
    await waitFor(() => expect(results).toEqual([true]))
  })

  it('reports false on a validation failure WITHOUT resetting unsaved input', async () => {
    const schema = z.object({ title: z.string().min(2, '太短'), other: z.string() })
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} schema={schema} results={results} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))

    await waitFor(() => expect(results).toEqual([false]))
    expect(commit).not.toHaveBeenCalled()
    // The panel flush keeps the dirty input and its error (no rollback).
    expect(input).toHaveValue('A')
    expect(toastMock.error).toHaveBeenCalledOnce()
  })

  it('reports false on a rejected commit and leaves the card dirty for a retry', async () => {
    commit.mockResolvedValueOnce({ ok: false })
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'Retry me' } })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    await waitFor(() => expect(results).toEqual([false]))

    commit.mockResolvedValueOnce({ ok: true, section: {} })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    await waitFor(() => expect(results).toEqual([false, true]))
    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Retry me' })
  })

  it('reports false when the commit throws (no unhandled rejection)', async () => {
    commit.mockRejectedValueOnce(new Error('network down'))
    const results: boolean[] = []
    renderUi(<FlushHarness source={{ title: 'Hello', other: 'x' }} results={results} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), { target: { value: 'Boom' } })
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))

    await waitFor(() => expect(results).toEqual([false]))
    expect(screen.getByRole('textbox', { name: 'title' })).toHaveValue('Boom')
  })
})
