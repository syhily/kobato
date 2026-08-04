import type { ResolvedImageMeta } from '@kobato/shared/types/images'

import { createContext, use, type ReactNode } from 'react'

export type ImageMetaMap = Record<string, ResolvedImageMeta>

const ImageMetaContext = createContext<ImageMetaMap | undefined>(undefined)

export function ImageMetaProvider({ children, value }: { children: ReactNode; value?: ImageMetaMap }) {
  return <ImageMetaContext value={value}>{children}</ImageMetaContext>
}

export function useImageMeta(): ImageMetaMap | undefined {
  return use(ImageMetaContext)
}
