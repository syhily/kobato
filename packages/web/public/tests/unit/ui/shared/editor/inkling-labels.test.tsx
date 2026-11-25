// @vitest-environment happy-dom

import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'
import { useKobatoInklingLabels } from '@kobato/web-public/ui/shared/editor/inkling-labels'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

function readLabels(rootLoaderData: unknown) {
  let labels: ReturnType<typeof useKobatoInklingLabels> = undefined
  function Probe() {
    labels = useKobatoInklingLabels()
    return null
  }
  const routes: RouteObject[] = [{ id: 'root', path: '*', element: <Probe /> }]
  const router = createMemoryRouter(
    routes,
    rootLoaderData === undefined ? {} : { hydrationData: { loaderData: { root: rootLoaderData } } },
  )
  render(<RouterProvider router={router} />)
  return labels
}

describe('client/editor/inkling-labels — payload resolver', () => {
  it('returns the loader payload table for the active locale', () => {
    const labels = readLabels({ i18n: { locale: 'zh-CN', inklingLabels: kobatoInklingLabelsZhCN } })
    expect(labels).toBe(kobatoInklingLabelsZhCN)
    expect(labels?.['placeholder.editor']).toBe('开始撰写内容…')
  })

  it('never blends another locale into the active table', () => {
    const labels = readLabels({ i18n: { locale: 'zh-TW', inklingLabels: kobatoInklingLabelsZhTW } })
    expect(labels).toBe(kobatoInklingLabelsZhTW)
    expect(labels?.['placeholder.editor']).not.toBe(kobatoInklingLabelsZhCN['placeholder.editor'])
  })

  it('degrades to Inkling English defaults when the payload is absent', () => {
    expect(readLabels(undefined)).toBeUndefined()
    expect(readLabels({ i18n: null })).toBeUndefined()
    expect(readLabels({})).toBeUndefined()
  })
})
