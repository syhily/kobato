import type { ErrorMessageDescriptor } from '@kobato/api/contracts/api-error'
import type { CardConfig } from '@kobato/inkling'

import { orpc } from '@kobato/web-client/api/client'

const MATH_RENDER_DEBOUNCE_MS = 200

type MathRenderResult = { mathml?: string; error?: string }

export type MathErrorResolver = (descriptor: ErrorMessageDescriptor) => string

export type MathErrorLocalizer = (
  value: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string

export function resolveMathError(descriptor: ErrorMessageDescriptor, localizeMessage: MathErrorLocalizer): string {
  const localized = localizeMessage(descriptor.messageKey, descriptor.params)
  return localized === descriptor.messageKey ? descriptor.fallbackMessage : localized
}

interface PendingMathRender {
  timer: ReturnType<typeof setTimeout>
  fallbackMessage: string
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
