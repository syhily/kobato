import type { ReactNode } from 'react'

import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { useDocumentLabels } from '@kobato/ui/lib/use-document-labels'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const LABELS = { 'placeholder.editor': '開始撰寫內容…', 'menu.host.kobato-image.label': '圖片' }

function readLabels(labels: Record<string, string> | undefined) {
  return renderHook(() => useDocumentLabels(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentFactsProvider value={documentFactsFor(labels === undefined ? {} : { labels })}>
        {children}
      </DocumentFactsProvider>
    ),
  }).result.current
}

describe('lib/useDocumentLabels', () => {
  it('hands the document label payload to shared modules untouched', () => {
    expect(readLabels(LABELS)).toBe(LABELS)
  })

  it('is undefined when the document carries no label payload', () => {
    expect(readLabels(undefined)).toBeUndefined()
  })
})
