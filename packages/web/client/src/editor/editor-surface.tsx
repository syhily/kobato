import type {
  ExternalControlAPI,
  InklingComposerProps,
  InklingLabelsInput,
  LexicalEditor,
  SerializedEditorState,
} from '@kobato/inkling'

import { InklingComposer } from '@kobato/inkling'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useTheme } from '@kobato/ui/lib/ThemeProvider.tsx'
import { useKobatoInklingLabels } from '@kobato/web-client/editor/inkling-labels.ts'
import { useEditorBodyReset } from '@kobato/web-client/editor/use-editor-body-reset.ts'
import { useCallback, useState } from 'react'

export interface UseEditorSurfaceArgs<TBody extends SerializedEditorState> {
  /** Initial body. Only read on first mount + when `bodyKey` changes. */
  initialBody: TBody
  bodyKey: string
  onBodyChange: (body: TBody) => void
  /** Shapes the seed before the composer parses it (the comment surface's
   *  unparseable-seed fallback + math-fence downgrade); the page surface seeds as-is. */
  prepareSeed?: (body: TBody) => TBody
}

export interface EditorSurfaceHandle<TBody extends SerializedEditorState> {
  editorInstance: LexicalEditor | null
  registerAPI: (api: ExternalControlAPI | null) => void
  /** The mount-pinned seed — the only valid `initialEditorState` for the paired composer. */
  mountedInitialState: TBody
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
  const payloadLabels = useKobatoInklingLabels()
  const labels = explicitLabels ?? payloadLabels
  const { children, ...composerProps } = props
  return (
    <InklingComposer {...composerProps} labels={labels} wordCountLanguage={locale} darkMode={resolvedTheme === 'dark'}>
      {children}
    </InklingComposer>
  )
}
