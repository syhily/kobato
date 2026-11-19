import type { FC } from 'react'

export function asRoute(component: unknown): FC<Record<string, unknown>> {
  return component as FC<Record<string, unknown>>
}
