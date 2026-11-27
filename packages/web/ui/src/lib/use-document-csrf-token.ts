import { useDocumentFacts } from '@kobato/ui/lib/document-facts-context'

export function useDocumentCsrfToken(): string | undefined {
  return useDocumentFacts().csrfToken
}
