// @vitest-environment happy-dom

import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'
import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useKobatoInklingLabels } from '@/ui/shared/use-inkling-labels'

function readLabels(labels: Record<string, string> | undefined) {
  let resolved: ReturnType<typeof useKobatoInklingLabels> = undefined
  function Probe() {
    resolved = useKobatoInklingLabels()
    return null
  }
  render(
    <DocumentFactsProvider value={documentFactsFor(labels === undefined ? {} : { labels })}>
      <Probe />
    </DocumentFactsProvider>,
  )
  return resolved
}

describe('ui/shared/use-inkling-labels — document-shell payload resolver', () => {
  it('returns the loader payload table for the active locale', () => {
    const labels = readLabels(kobatoInklingLabelsZhCN)
    expect(labels).toBe(kobatoInklingLabelsZhCN)
    expect(labels?.['placeholder.editor']).toBe('开始撰写内容…')
  })

  it('never blends another locale into the active table', () => {
    const labels = readLabels(kobatoInklingLabelsZhTW)
    expect(labels).toBe(kobatoInklingLabelsZhTW)
    expect(labels?.['placeholder.editor']).not.toBe(kobatoInklingLabelsZhCN['placeholder.editor'])
  })

  it('degrades to Inkling English defaults when the payload is absent', () => {
    expect(readLabels(undefined)).toBeUndefined()
  })
})
