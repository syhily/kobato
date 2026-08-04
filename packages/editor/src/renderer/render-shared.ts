import { createContext } from 'react'

export interface MusicPresentationCtx {
  suppressAutoplay: boolean
}
export const MusicPresentationContext = createContext<MusicPresentationCtx>({
  suppressAutoplay: false,
})
