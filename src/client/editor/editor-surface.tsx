// The inkling composer skeleton both kobato editor surfaces (the page/article
// body editor and the comment composer) share.
//
// - `useEditorSurface` — the `registerAPI` → editor-instance dance and the
//   body mount-snapshot/reseed wiring (`use-editor-body-reset`), parameterized
//   by the surface's body type and optional seed shaping (`prepareSeed` — the
//   comment surface's legacy math-fence downgrade).
// - `EditorSurfaceComposer` — the InklingComposer shell with the host
//   constants applied (the active locale's labels, theme-driven `darkMode`,
//   the locale as the word-count language); every other prop passes straight
//   through, and `nodes` stays required so a surface can never silently mount
//   the full card set.
//
// Host components keep the shell chrome, the surface element itself
// (InklingEditor vs InklingSurface), and the Ctrl+Q capture on the shell div.

import { useCallback, useState } from 'react'

import type {
  ExternalControlAPI,
  InklingComposerProps,
  InklingLabelsInput,
  LexicalEditor,
  SerializedEditorState,
} from '@/inkling'

import { useKobatoInklingLabels } from '@/client/editor/inkling-labels'
import { useEditorBodyReset } from '@/client/editor/use-editor-body-reset'
import { InklingComposer } from '@/inkling'
import { useI18n } from '@/ui/lib/I18nProvider'
import { useTheme } from '@/ui/lib/ThemeProvider'

export interface UseEditorSurfaceArgs<TBody extends SerializedEditorState> {
  /** Initial body. Only read on first mount + when `bodyKey` changes. */
  initialBody: TBody
  /** Identity of the body source — a change reseeds the editor content from `initialBody`. */
  bodyKey: string
  /** Fired on every editor update with the freshly-serialized body. */
  onBodyChange: (body: TBody) => void
  /** Shapes the seed before the composer parses it (the comment surface's
   *  legacy-PT fallback + math-fence downgrade); the page surface seeds as-is. */
  prepareSeed?: (body: TBody) => TBody
}

export interface EditorSurfaceHandle<TBody extends SerializedEditorState> {
  /** The live Lexical instance — null until the composer registers its API. */
  editorInstance: LexicalEditor | null
  /** The composer's ExternalControlAPI sink — pass to the surface element. */
  registerAPI: (api: ExternalControlAPI | null) => void
  /** The mount-pinned seed — the only valid `initialEditorState` for the paired composer. */
  mountedInitialState: TBody
  /** The stable per-keystroke change emitter — pass to the surface element's `onChange`. */
  handleChange: (state: SerializedEditorState) => void
}

export function useEditorSurface<TBody extends SerializedEditorState>({
  initialBody,
  bodyKey,
  onBodyChange,
  prepareSeed,
}: UseEditorSurfaceArgs<TBody>): EditorSurfaceHandle<TBody> {
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  const { mountedInitialState, handleChange } = useEditorBodyReset(
    editorInstance,
    initialBody,
    bodyKey,
    onBodyChange,
    prepareSeed,
  )

  return { editorInstance, registerAPI, mountedInitialState, handleChange }
}

/** Composer props minus the host-owned constants (`labels`, `darkMode`);
 *  `nodes` is re-required — a surface always names its node set. */
export interface EditorSurfaceComposerProps extends Omit<
  InklingComposerProps,
  'labels' | 'darkMode' | 'nodes' | 'wordCountLanguage'
> {
  nodes: NonNullable<InklingComposerProps['nodes']>
  /**
   * The surface's label overlay. Workspace surfaces omit it and read the active
   * locale's table from the root payload; the public comment composer passes the
   * table it loaded after activation.
   */
  labels?: InklingLabelsInput
}

export function EditorSurfaceComposer({ labels: explicitLabels, ...props }: EditorSurfaceComposerProps) {
  const { resolvedTheme } = useTheme()
  const { locale } = useI18n()
  // Only workspace documents carry the active locale's table in the root loader
  // payload; a missing payload (public document, root-loader failure, router-less
  // render) falls back to Inkling's English defaults.
  const payloadLabels = useKobatoInklingLabels()
  const labels = explicitLabels ?? payloadLabels
  const { children, ...composerProps } = props
  return (
    <InklingComposer {...composerProps} labels={labels} wordCountLanguage={locale} darkMode={resolvedTheme === 'dark'}>
      {children}
    </InklingComposer>
  )
}
