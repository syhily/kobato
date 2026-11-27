// @vitest-environment happy-dom

import { DocumentFactsProvider, useDocumentFacts } from '@kobato/ui/lib/document-facts-context'
import { documentFactsFor, TEST_DOCUMENT_FACTS } from '@kobato/ui/tests/utils/document-facts'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

function Probe() {
  const facts = useDocumentFacts()
  return <span data-testid="facts">{`${facts.locale}|${facts.csrfToken ?? ''}`}</span>
}

describe('lib/document-facts-context', () => {
  it('hands the provided document facts to every module below the provider', () => {
    const { getByTestId } = render(
      <DocumentFactsProvider value={documentFactsFor({ locale: 'en-US', csrfToken: 'token-1' })}>
        <Probe />
      </DocumentFactsProvider>,
    )
    expect(getByTestId('facts').textContent).toBe('en-US|token-1')
  })

  it('adds no markup of its own (the provider is invisible in the document)', () => {
    const html = renderToStaticMarkup(
      <DocumentFactsProvider value={TEST_DOCUMENT_FACTS}>
        <p>content</p>
      </DocumentFactsProvider>,
    )
    expect(html).toBe('<p>content</p>')
  })

  it('throws a named error when a facts hook runs outside the document shell', () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrowError(/document shell/)
  })
})
