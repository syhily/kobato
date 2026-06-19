import type { ReactNode } from 'react'

import { createContext, useContext } from 'react'

export interface InklingArticleEditorActions {
  /** Open the image library picker. Injected by the shell so cards stay server-free. */
  openImagePicker?: () => void
  /** Open the music picker dialog. Injected by the shell so cards stay server-free. */
  openMusicPicker?: () => void
}

const InklingArticleEditorContext = createContext<InklingArticleEditorActions>({})

export function InklingArticleEditorProvider({
  children,
  actions,
}: {
  children: ReactNode
  actions: InklingArticleEditorActions
}) {
  return <InklingArticleEditorContext.Provider value={actions}>{children}</InklingArticleEditorContext.Provider>
}

export function useInklingArticleEditorActions(): InklingArticleEditorActions {
  return useContext(InklingArticleEditorContext)
}
