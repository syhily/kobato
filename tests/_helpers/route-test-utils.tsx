import type { FC } from 'react'

/** Cast a route default export to a component accepting any prop bag —
 *  generated Route.ComponentProps types are stricter than tests need. */
export function asRoute<T>(component: T): FC<Record<string, unknown>> {
  return component as unknown as FC<Record<string, unknown>>
}
