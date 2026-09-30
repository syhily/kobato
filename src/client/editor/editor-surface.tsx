// The inkling composer skeleton both kobato editor surfaces (the page/article
// body editor and the comment composer) share — extracted from
// `@/ui/admin/editor/PageBodyEditor` and `@/ui/public/comments/CommentBodyEditor`,
// where it was copy-shaped:
//
// - `useEditorSurface` — the per-surface hook: the `registerAPI` →
//   editor-instance dance and the body mount-snapshot/reseed wiring
//   (`use-editor-body-reset`), parameterized by the surface's body type and
//   optional seed shaping (`prepareSeed` — the comment surface's legacy-PT
//   fallback + math-fence downgrade).
// - `EditorSurfaceComposer` — the InklingComposer shell with the host
//   constants applied (the zh-CN labels, theme-driven `darkMode`); every
//   delta — node set, `fileUploader`/`cardConfig`, the ui-prefs flags
//   (`isEmojiEnabled`, `codeEditor`), the drag scroll selector — passes
//   straight through, and `nodes` stays required so a surface can never
//   silently mount the full card set.
//
// What stays in the host components: the shell chrome around the composer
// (the page surface's scroll container + hydration placeholder + focus-mode
// button, the comment surface's click-to-focus box), the surface element
// itself (InklingEditor vs InklingSurface and its props/children), and the
// Ctrl+Q quote/aside capture on the shell div (`block-quote-aside-cycle`).

import { useCallback, useState } from 'react'

import type { ExternalControlAPI, InklingComposerProps, LexicalEditor, SerializedEditorState } from '@/inkling'

import { inklingLabels } from '@/client/editor/inkling-labels'
import { useEditorBodyReset } from '@/client/editor/use-editor-body-reset'
import { InklingComposer } from '@/inkling'
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
export interface EditorSurfaceComposerProps extends Omit<InklingComposerProps, 'labels' | 'darkMode' | 'nodes'> {
  nodes: NonNullable<InklingComposerProps['nodes']>
}

export function EditorSurfaceComposer(props: EditorSurfaceComposerProps) {
  const { resolvedTheme } = useTheme()
  return <InklingComposer {...props} labels={inklingLabels} darkMode={resolvedTheme === 'dark'} />
}
