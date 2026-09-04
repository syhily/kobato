// The `cardConfig.renderMath` adapter (plan M3): inkling previews block and
// inline math through this channel while editing; the persisted mathml/svg
// artifacts are filled by the save pipeline, never written back. Kobato's
// channel is `orpc.admin.renders.math` (server-side KaTeX) behind a 200ms
// trailing-edge debounce keyed by (tex, display) — retyping coalesces, and
// concurrent callers editing the same formula share one round-trip.

import type { CardConfig } from '@inkling/editor'

import { orpc } from '@/client/api/client'

const MATH_RENDER_DEBOUNCE_MS = 200

type MathRenderResult = { mathml?: string; error?: string }

interface PendingMathRender {
  timer: ReturnType<typeof setTimeout>
  waiters: Array<(result: MathRenderResult) => void>
}

const pendingMathRenders = new Map<string, PendingMathRender>()

function fireMathRender(key: string, tex: string, display: boolean): void {
  const pending = pendingMathRenders.get(key)
  if (pending === undefined) {
    return
  }
  pendingMathRenders.delete(key)
  orpc.admin.renders
    .math({ tex, display })
    .then(({ mathml, error }) => {
      const result: MathRenderResult = error === null ? { mathml } : { error }
      for (const resolve of pending.waiters) {
        resolve(result)
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '公式渲染失败'
      for (const resolve of pending.waiters) {
        resolve({ error: message })
      }
    })
}

export const renderMath: NonNullable<CardConfig['renderMath']> = ({ tex, display }) => {
  const key = `${display ? '1' : '0'}${tex}`
  const existing = pendingMathRenders.get(key)
  if (existing !== undefined) {
    clearTimeout(existing.timer)
    return new Promise<MathRenderResult>((resolve) => {
      existing.waiters.push(resolve)
      existing.timer = setTimeout(() => fireMathRender(key, tex, display), MATH_RENDER_DEBOUNCE_MS)
    })
  }
  return new Promise<MathRenderResult>((resolve) => {
    pendingMathRenders.set(key, {
      waiters: [resolve],
      timer: setTimeout(() => fireMathRender(key, tex, display), MATH_RENDER_DEBOUNCE_MS),
    })
  })
}
