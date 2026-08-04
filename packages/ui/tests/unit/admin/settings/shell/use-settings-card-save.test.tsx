// @vitest-environment happy-dom

import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const commit = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@kobato/ui/admin/settings/useSettingsMutation', () => ({
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

// The save chain (react-hook-form submit → schema parse → mocked commit →
// baseline update) is fully microtask-driven: the event loop drains the
// entire microtask queue — including freshly queued links — before the
// next macrotask, so two event-loop turns settle every pending save chain
// deterministically. If a stray commit were ever going to fire, it has
// fired by the time this resolves. Replaces fixed 20ms sleeps.
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
    // The dirty guard compares `getValues()` (raw) against the committed
    // baseline. If the baseline stored the resolver-PARSED values, a `.trim()`
    // transform would make the card permanently dirty and every panel flush
    // would re-POST the same patch.
    function Harness({ source }: { source: Source }) {
      const { form, flushOnBlur } = useSettingsCard<Source, State>(
        makeCardProps(source, z.object({ title: z.string().trim().min(1) })),
      )
      return <input aria-label="title" {...form.register('title')} onBlur={flushOnBlur} />
    }

    render(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: '  Typed  ' } })
    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    // The patch is the schema-parsed (trimmed) value…
    expect(commit.mock.calls[0]![1]).toEqual({ title: 'Typed' })

    // …but afterwards the card is clean: another blur / panel flush is a no-op.
    fireEvent.blur(input)
    await settleSaveChains()
    expect(commit).toHaveBeenCalledOnce()
  })

  it('rolls the control back and toasts a visible error when validation rejects a save', async () => {
    function Harness({ source }: { source: Source }) {
      const { form, save } = useSettingsCard<Source, State>(
        makeCardProps(source, z.object({ title: z.string().min(1, '请填写站点标题') })),
      )
      return (
        <div>
          <input aria-label="title" {...form.register('title')} />
          <button type="button" onClick={() => save()}>
            save
          </button>
        </div>
      )
    }

    render(<Harness source={{ title: 'Hello' }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    // Nothing was persisted, the user sees why, and the control no longer
    // holds the invalid value.
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(toastMock.error.mock.calls[0]).toEqual(['设置未保存', { description: '请填写站点标题' }])
    await waitFor(() => expect(input).toHaveValue('Hello'))
    expect(commit).not.toHaveBeenCalled()
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
              // The SettingsSwitch wiring: field.onChange first, then save(name).
              form.setValue('enabled', true)
              save('enabled')
            }}
          >
            toggle
          </button>
        </div>
      )
    }

    render(<Harness source={{ title: 'Hello', enabled: false }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    // The keyboard-trigger shape: the user is mid-edit in the text field
    // (no blur — nothing committed) when the switch fires.
    fireEvent.change(input, { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ enabled: true })

    // The half-typed text stays local and dirty — its own blur commits it.
    // (The blur path posts the card's honest full patch, so the already-
    // committed `enabled` rides along at its SAVED value — idempotent.)
    fireEvent.blur(input)
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
    expect(commit.mock.calls[1]![1]).toEqual({ title: 'Half typed', enabled: true })
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

    render(<Harness source={{ title: 'Hello', enabled: false }} />)
    const input = screen.getByRole('textbox', { name: 'title' })

    fireEvent.change(input, { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(toastMock.error.mock.calls[0]).toEqual(['设置未保存', { description: '当前不允许开启' }])
    expect(commit).not.toHaveBeenCalled()
    // The sibling's in-flight edit survives the rollback.
    expect(input).toHaveValue('Half typed')
  })

  it('a control that fired without moving its value commits nothing', async () => {
    function Harness({ source }: { source: ToggleSource }) {
      const { save } = useSettingsCard<ToggleSource, ToggleState>(makeToggleProps(source))
      return (
        <button type="button" onClick={() => save('enabled')}>
          reselect
        </button>
      )
    }

    render(<Harness source={{ title: 'Hello', enabled: false }} />)
    fireEvent.click(screen.getByRole('button', { name: 'reselect' }))
    await settleSaveChains()
    expect(commit).not.toHaveBeenCalled()
  })
})
