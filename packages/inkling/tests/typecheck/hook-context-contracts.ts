import type { BookmarkEmbedResponse, CardConfig } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { UseDropTargetOptions } from '@kobato/inkling-internal/hooks/useDropTarget'
import type { PinturaConfig } from '@kobato/inkling-internal/hooks/usePinturaEditor'

const _pinturaConfig = { jsUrl: '/pintura.js', cssUrl: '/pintura.css' } satisfies PinturaConfig

// @ts-expect-error - only URLs consumed by the hook belong in PinturaConfig
const _openPinturaConfig = { jsUrl: '/pintura.js', vendorOption: true } satisfies PinturaConfig

declare const cardConfig: CardConfig
const _embedResponse: Promise<BookmarkEmbedResponse | undefined> | undefined = cardConfig.fetchEmbed?.(
  'https://example.com',
  { type: 'bookmark' },
)

type GetDraggableInfo = NonNullable<UseDropTargetOptions['getDraggableInfo']>
type GetIndicatorPosition = NonNullable<UseDropTargetOptions['getIndicatorPosition']>

// @ts-expect-error - the legacy empty-object sentinel is not draggable information
const _legacyDraggableResult: ReturnType<GetDraggableInfo> = {}

// @ts-expect-error - a supplied indicator callback returns a position or false, never undefined
const _nullableIndicatorResult: ReturnType<GetIndicatorPosition> = undefined
