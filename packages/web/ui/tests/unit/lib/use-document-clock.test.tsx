// @vitest-environment happy-dom

import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { useDocumentClock } from '@kobato/ui/lib/use-document-clock'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LOADER_NOW = '2026-07-31T23:59:00.000Z'
const CLIENT_NOW = '2026-08-01T00:30:00.000Z'

function setup(nowIso?: string) {
  const renders: string[] = []
  function Harness() {
    renders.push(useDocumentClock().toISOString())
    return null
  }
  const facts = nowIso === undefined ? documentFactsFor() : documentFactsFor({ nowIso })
  render(
    <DocumentFactsProvider value={facts}>
      <Harness />
    </DocumentFactsProvider>,
  )
  return { renders }
}

describe('useDocumentClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(CLIENT_NOW) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the document instant first (SSR/hydration parity), then switches to the live client clock after mount', async () => {
    const { renders } = setup(LOADER_NOW)
    await act(async () => {})

    expect(renders[0]).toBe(LOADER_NOW)
    expect(renders.at(-1)).toBe(CLIENT_NOW)
  })

  it('falls back to the client clock before mount when the document carries no instant', async () => {
    const { renders } = setup()
    await act(async () => {})

    expect(renders[0]).toBe(CLIENT_NOW)
    expect(renders.at(-1)).toBe(CLIENT_NOW)
  })

  it('refreshes the client clock every minute so a long-lived tab rolls over', async () => {
    const { renders } = setup(LOADER_NOW)
    await act(async () => {})

    act(() => vi.advanceTimersByTime(60_000))

    expect(renders.at(-1)).toBe('2026-08-01T00:31:00.000Z')
  })
})
