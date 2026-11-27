import type { ReactNode } from 'react'

import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { useDocumentCsrfToken } from '@kobato/ui/lib/use-document-csrf-token'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function readToken(csrfToken: string | undefined) {
  return renderHook(() => useDocumentCsrfToken(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentFactsProvider value={documentFactsFor({ csrfToken })}>{children}</DocumentFactsProvider>
    ),
  }).result.current
}

describe('lib/useDocumentCsrfToken', () => {
  it('hands the document CSRF token to shared modules', () => {
    expect(readToken('csrf-123')).toBe('csrf-123')
  })

  it('is undefined when the document carries no token', () => {
    expect(readToken(undefined)).toBeUndefined()
  })
})
