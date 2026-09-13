// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCodeCopyButtons } from '@/ui/public/post/use-code-copy-buttons'

// The hydration twin of the retired PT CodeBlock chrome: exported
// `pre > code[data-code]` markup gets a wrapper + language label + copy
// button injected after mount.

const EXPORTED =
  '<pre><code class="language-typescript" data-language="typescript" data-code="const a = &lt;b&gt;;">' +
  '<span class="line"><span style="color:#111">const a = &lt;b&gt;;</span></span></code></pre>'

function mountContainer(html: string): { container: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return { container, ref: createRef<HTMLDivElement>() }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('useCodeCopyButtons', () => {
  it('injects the wrapper, language label, and copy button around exported code blocks', () => {
    const { container, ref } = mountContainer(EXPORTED)
    ;(ref as { current: HTMLDivElement | null }).current = container

    renderHook(() => useCodeCopyButtons(ref, EXPORTED))

    const wrapper = container.querySelector('.code-block-wrapper')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector(':scope > .code-header')).not.toBeNull()
    expect(wrapper?.querySelector(':scope > pre')).not.toBeNull()
    // LANGUAGE_MAP keys the shorthand ('ts'); the export's full name falls back to capitalization.
    expect(container.querySelector('.language-label')?.textContent).toBe('Typescript')
    const button = container.querySelector('button.copy-code')
    expect(button?.textContent).toBe('Copy')
    expect(button?.getAttribute('aria-label')).toBe('Copy Typescript code to clipboard')
  })

  it('copies the raw data-code text on click and shows the confirmation label', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const { container, ref } = mountContainer(EXPORTED)
    ;(ref as { current: HTMLDivElement | null }).current = container
    renderHook(() => useCodeCopyButtons(ref, EXPORTED))

    const button = container.querySelector<HTMLButtonElement>('button.copy-code')
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('const a = <b>;')
    expect(button!.textContent).toBe('Copied')
  })

  it('does not double-wrap on a re-run', () => {
    const { container, ref } = mountContainer(EXPORTED)
    ;(ref as { current: HTMLDivElement | null }).current = container

    const { rerender } = renderHook(() => useCodeCopyButtons(ref, EXPORTED))
    rerender()

    expect(container.querySelectorAll('.code-block-wrapper')).toHaveLength(1)
    expect(container.querySelectorAll('button.copy-code')).toHaveLength(1)
  })

  it('leaves code blocks without a data-code hook untouched (feed-variant markup)', () => {
    const html = '<pre><code class="language-ts">plain</code></pre>'
    const { container, ref } = mountContainer(html)
    ;(ref as { current: HTMLDivElement | null }).current = container

    renderHook(() => useCodeCopyButtons(ref, html))

    expect(container.querySelector('.code-block-wrapper')).toBeNull()
  })

  it("wraps the new article's code blocks when bodyHtml changes (client-side navigation)", () => {
    const htmlA = '<p>no code</p>'
    const { container, ref } = mountContainer(htmlA)
    ;(ref as { current: HTMLDivElement | null }).current = container

    const { rerender } = renderHook(({ html }) => useCodeCopyButtons(ref, html), { initialProps: { html: htmlA } })
    expect(container.querySelector('.code-block-wrapper')).toBeNull()

    container.innerHTML = EXPORTED
    rerender({ html: EXPORTED })

    expect(container.querySelector('.code-block-wrapper')).not.toBeNull()
    expect(container.querySelector('button.copy-code')?.textContent).toBe('Copy')
  })

  it('no-ops on a null container', () => {
    expect(() => renderHook(() => useCodeCopyButtons({ current: null }, ''))).not.toThrow()
  })

  it('scans the container for exported code blocks rather than gating on a bodyHtml substring', () => {
    const { container, ref } = mountContainer(EXPORTED)
    ;(ref as { current: HTMLDivElement | null }).current = container

    // The re-scan key intentionally carries no 'data-code' marker.
    renderHook(() => useCodeCopyButtons(ref, 'rescan-key'))

    expect(container.querySelector('.code-block-wrapper')).not.toBeNull()
  })
})
