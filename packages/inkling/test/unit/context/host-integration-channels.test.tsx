import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  InklingHostIntegrationProvider,
  useInklingGifSettings,
  useInklingHostEssentials,
  useInklingMathSettings,
} from '@/context/InklingHostIntegrationContext'

import { createHostIntegrationValue } from '../../utils/host-integration-context'

// The C4 re-render domain: one feature slice's identity changing must
// re-render only that channel's consumers, not the other channels'.
describe('InklingHostIntegrationProvider', () => {
  it('re-renders only the channel whose slice identity changed', () => {
    let gifRenders = 0
    let mathRenders = 0
    let essentialsRenders = 0

    function GifConsumer() {
      gifRenders += 1
      useInklingGifSettings()
      return null
    }
    function MathConsumer() {
      mathRenders += 1
      useInklingMathSettings()
      return null
    }
    function EssentialsConsumer() {
      essentialsRenders += 1
      useInklingHostEssentials()
      return null
    }

    // a constant element tree: consumers re-render only via context, never
    // via the parent's re-render
    const children = (
      <>
        <GifConsumer />
        <MathConsumer />
        <EssentialsConsumer />
      </>
    )

    const renderMath = vi.fn()
    const value = createHostIntegrationValue({
      cardConfig: { tenor: { googleApiKey: 'key-a' }, renderMath },
    })

    const { rerender } = render(
      <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>,
    )

    expect(gifRenders).toBe(1)
    expect(mathRenders).toBe(1)
    expect(essentialsRenders).toBe(1)

    // a fresh whole value whose gif slice changed identity: only the gif
    // channel's consumers re-render
    rerender(
      <InklingHostIntegrationProvider
        value={{ ...value, cardConfig: { tenor: { googleApiKey: 'key-b' }, renderMath } }}
      >
        {children}
      </InklingHostIntegrationProvider>,
    )

    expect(gifRenders).toBe(2)
    expect(mathRenders).toBe(1)
    expect(essentialsRenders).toBe(1)
  })

  it('keeps every channel stable when a fresh whole value carries identical leaves', () => {
    let gifRenders = 0
    let mathRenders = 0
    let essentialsRenders = 0

    function GifConsumer() {
      gifRenders += 1
      useInklingGifSettings()
      return null
    }
    function MathConsumer() {
      mathRenders += 1
      useInklingMathSettings()
      return null
    }
    function EssentialsConsumer() {
      essentialsRenders += 1
      useInklingHostEssentials()
      return null
    }

    const children = (
      <>
        <GifConsumer />
        <MathConsumer />
        <EssentialsConsumer />
      </>
    )

    const renderMath = vi.fn()
    const value = createHostIntegrationValue({ cardConfig: { renderMath } })

    const { rerender } = render(
      <InklingHostIntegrationProvider value={value}>{children}</InklingHostIntegrationProvider>,
    )

    expect(gifRenders).toBe(1)
    expect(mathRenders).toBe(1)
    expect(essentialsRenders).toBe(1)

    // the host rebuilt cardConfig (the `cardConfig = {}` default policy):
    // identical leaf references keep every channel's value stable
    rerender(
      <InklingHostIntegrationProvider value={{ ...value, cardConfig: { renderMath } }}>
        {children}
      </InklingHostIntegrationProvider>,
    )

    expect(gifRenders).toBe(1)
    expect(mathRenders).toBe(1)
    expect(essentialsRenders).toBe(1)
  })
})
