import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

export interface RenderHookOptions<THookResult> {
  initialPath?: string
  /** Actions applied sequentially during the same render pass. */
  actions?: Array<(result: THookResult) => void>
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
}

/** Minimal SSR hook runner: renders the hook in a memory router, applies
 *  queued actions, returns the final result. Avoids @testing-library/react. */
export function renderHook<THookResult>(
  hookFn: () => THookResult,
  options: RenderHookOptions<THookResult> = {},
): THookResult {
  const resultRef: { current: THookResult | null } = { current: null }
  const { initialPath = '/', actions = [], wrapper: Wrapper } = options

  function Harness() {
    const result = hookFn()
    resultRef.current = result
    const applied = React.useRef(0)
    while (applied.current < actions.length) {
      actions[applied.current](result)
      applied.current++
    }
    return null
  }

  let element: React.ReactElement = <Harness />
  if (Wrapper) {
    element = <Wrapper>{element}</Wrapper>
  }

  const routes: RouteObject[] = [{ path: '*', element }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  renderToStaticMarkup(<RouterProvider router={router} />)
  return resultRef.current!
}
