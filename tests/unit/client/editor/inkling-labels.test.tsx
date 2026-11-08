// @vitest-environment happy-dom

// The client resolver for the ACTIVE locale's Inkling label overlay. The tables
// are server data: the root loader's `i18n.inklingLabels` carries exactly one
// of them, so the composer never imports a table module (the four-table import
// that used to sit here put ~22 KB of every language into the public comment
// composer chunk). Pinned by `tests/unit/arch/client-bundle.test.ts`; this
// suite pins the payload read + the degraded no-payload path.

import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import { useKobatoInklingLabels } from '@/client/editor/inkling-labels'
import { kobatoInklingLabelsZhCN } from '@/shared/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhTW } from '@/shared/i18n/inkling-labels/zh-TW'

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
    // Root-loader failure / router-less test render: the composer gets no
    // override table and Inkling's own English defaults apply.
    expect(readLabels(undefined)).toBeUndefined()
    expect(readLabels({ i18n: null })).toBeUndefined()
    expect(readLabels({})).toBeUndefined()
  })
})
