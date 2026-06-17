import type { FC } from 'react'

/**
 * Cast a React Router 7 route default export to a component that accepts any
 * prop bag. Generated `Route.ComponentProps` types are strict (they include
 * `matches`, `params`, etc.), but tests only need to feed the props the route
 * component actually reads. This escape hatch keeps test fixtures concise
 * while still exercising the route component under SSR.
 */
export function asRoute<T>(component: T): FC<Record<string, unknown>> {
  return component as unknown as FC<Record<string, unknown>>
}
