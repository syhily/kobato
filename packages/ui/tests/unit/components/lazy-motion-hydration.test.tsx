import type { ReactNode } from 'react'

import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
// @vitest-environment happy-dom
import { Writable } from 'node:stream'
import { hydrateRoot } from 'react-dom/client'
import { renderToPipeableStream } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

function renderToPipeableStreamString(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = ''
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        out += chunk.toString()
        cb()
      },
      final(cb) {
        resolve(out)
        cb()
      },
    })
    const { pipe, abort } = renderToPipeableStream(node, {
      onAllReady: () => pipe(stream),
      onError: (error) => reject(error),
    })
    setTimeout(() => abort(), 5000)
  })
}

const configProps = {
  reducedMotion: 'user',
  transition: { duration: 0.15 },
} as const

describe('ui/components/lazy-motion — MotionConfig hydration contract', () => {
  it('renders children bare on the server (no Suspense boundary)', async () => {
    const html = await renderToPipeableStreamString(
      <LazyMotionConfig {...configProps}>
        <p>content</p>
      </LazyMotionConfig>,
    )
    expect(html).toContain('<p>content</p>')
    expect(html).not.toContain('<!--$')
    expect(html).not.toContain('<template')
  })

  it('hydrates without a mismatch', async () => {
    const html = await renderToPipeableStreamString(
      <LazyMotionConfig {...configProps}>
        <p>content</p>
      </LazyMotionConfig>,
    )

    document.body.innerHTML = `<div id="probe-root">${html}</div>`
    const errors: unknown[] = []
    hydrateRoot(
      document.getElementById('probe-root')!,
      <LazyMotionConfig {...configProps}>
        <p>content</p>
      </LazyMotionConfig>,
      { onRecoverableError: (error) => errors.push(error) },
    )
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(errors.map((e) => (e instanceof Error ? e.message : String(e)))).toEqual([])
    expect(document.querySelector('#probe-root p')?.textContent).toBe('content')
  })
})
