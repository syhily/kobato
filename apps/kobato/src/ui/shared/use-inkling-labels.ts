import type { KobatoInklingLabelKey } from '@kobato/i18n/inkling-labels/en-US'
import type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@kobato/inkling'

import { useDocumentLabels } from '@kobato/ui/lib/use-document-labels'

type AssertInklingLabelKeys<T extends keyof InklingLabels | InklingHostMenuLabelKey> = T
export type KobatoInklingLabelKeysAreLegal = AssertInklingLabelKeys<KobatoInklingLabelKey>

export function useKobatoInklingLabels(): InklingLabelsInput | undefined {
  return useDocumentLabels()
}
