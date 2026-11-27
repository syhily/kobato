import type { ContentBootstrapI18n } from '@kobato/api/contracts/public/content'
import type { KobatoInklingLabelKey } from '@kobato/i18n/inkling-labels/en-US'
import type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@kobato/inkling'

import { useRouteLoaderData } from 'react-router'

type AssertInklingLabelKeys<T extends keyof InklingLabels | InklingHostMenuLabelKey> = T
export type KobatoInklingLabelKeysAreLegal = AssertInklingLabelKeys<KobatoInklingLabelKey>

interface RootI18nData {
  i18n?: ContentBootstrapI18n | null
}

export function useKobatoInklingLabels(): InklingLabelsInput | undefined {
  return useRouteLoaderData<RootI18nData>('root')?.i18n?.inklingLabels
}
