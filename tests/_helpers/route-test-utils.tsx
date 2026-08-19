import type { FC } from 'react'

/** Cast a route default export to a component accepting any prop bag —
 *  generated Route.ComponentProps types are stricter than tests need. */
export function asRoute(component: unknown): FC<Record<string, unknown>> {
  return component as FC<Record<string, unknown>>
}
