import type { BookmarkEmbedResponse, CardConfig } from '@/context/InklingHostIntegrationContext'
/** Compile-time contracts closed by the hooks/context conversion-repair batch. */
import type { UseDropTargetOptions } from '@/hooks/useDropTarget'
import type { PinturaConfig } from '@/hooks/usePinturaEditor'

const pinturaConfig = { jsUrl: '/pintura.js', cssUrl: '/pintura.css' } satisfies PinturaConfig
void pinturaConfig

// @ts-expect-error - only URLs consumed by the hook belong in PinturaConfig
const openPinturaConfig = { jsUrl: '/pintura.js', vendorOption: true } satisfies PinturaConfig
void openPinturaConfig

declare const cardConfig: CardConfig
const embedResponse: Promise<BookmarkEmbedResponse | undefined> | undefined = cardConfig.fetchEmbed?.(
  'https://example.com',
  { type: 'bookmark' },
)
void embedResponse

type GetDraggableInfo = NonNullable<UseDropTargetOptions['getDraggableInfo']>
type GetIndicatorPosition = NonNullable<UseDropTargetOptions['getIndicatorPosition']>

// @ts-expect-error - the legacy empty-object sentinel is not draggable information
const legacyDraggableResult: ReturnType<GetDraggableInfo> = {}
void legacyDraggableResult

// @ts-expect-error - a supplied indicator callback returns a position or false, never undefined
const nullableIndicatorResult: ReturnType<GetIndicatorPosition> = undefined
void nullableIndicatorResult
