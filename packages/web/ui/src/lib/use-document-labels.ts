import type { DocumentLabels } from '@kobato/ui/lib/document-facts-context'

import { useDocumentFacts } from '@kobato/ui/lib/document-facts-context'

export function useDocumentLabels(): DocumentLabels | undefined {
  return useDocumentFacts().labels
}
