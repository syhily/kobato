// The `cardConfig.renderMath` adapter (plan M3): inkling previews block and
// inline math through this channel while editing; the persisted mathml/svg
// artifacts are filled by the save pipeline, never written back. Kobato's
// channel is `orpc.admin.renders.math` (server-side KaTeX) behind a 200ms
// trailing-edge debounce keyed by (tex, display) — retyping coalesces, and
// concurrent callers editing the same formula share one round-trip.

import type { CardConfig } from '@/inkling'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { orpc } from '@/client/api/client'

const MATH_RENDER_DEBOUNCE_MS = 200

type MathRenderResult = { mathml?: string; error?: string }

/** Resolve a wire error descriptor with the caller's active locale. */
export type MathErrorResolver = (descriptor: ErrorMessageDescriptor) => string

/** The caller's `useI18n().localizeMessage` seam (kept structural so this module stays ui-free). */
export type MathErrorLocalizer = (
  value: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string

/**
 * Resolve a server math-error descriptor for the Inkling host, which accepts
 * only a display string. `localizeMessage` passes an id it does not know
 * through unchanged; in that case show the descriptor's English
 * `fallbackMessage` rather than the raw catalog key.
 */
export function resolveMathError(descriptor: ErrorMessageDescriptor, localizeMessage: MathErrorLocalizer): string {
  const localized = localizeMessage(descriptor.messageKey, descriptor.params)
  return localized === descriptor.messageKey ? descriptor.fallbackMessage : localized
}

interface PendingMathRender {
  timer: ReturnType<typeof setTimeout>
  /** The first caller's translated fallback; a coalesced retry keeps it. */
  fallbackMessage: string
  /** The first caller's descriptor resolver; a coalesced retry keeps it. */
  resolveError: MathErrorResolver
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
      const result: MathRenderResult = error === null ? { mathml } : { error: pending.resolveError(error) }
      for (const resolve of pending.waiters) {
        resolve(result)
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : pending.fallbackMessage
      for (const resolve of pending.waiters) {
        resolve({ error: message })
      }
    })
}

export function makeRenderMath(
  resolveError: MathErrorResolver,
  fallbackMessage: string,
): NonNullable<CardConfig['renderMath']> {
  return ({ tex, display }) => {
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
        fallbackMessage,
        resolveError,
        timer: setTimeout(() => fireMathRender(key, tex, display), MATH_RENDER_DEBOUNCE_MS),
      })
    })
  }
}
