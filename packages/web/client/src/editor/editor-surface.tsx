import type {
  ExternalControlAPI,
  InklingComposerProps,
  InklingLabelsInput,
  LexicalEditor,
  SerializedEditorState,
} from '@kobato/inkling'

import { InklingComposer } from '@kobato/inkling'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useTheme } from '@kobato/ui/lib/ThemeProvider'
import { useKobatoInklingLabels } from '@kobato/web-client/editor/inkling-labels'
import { useEditorBodyReset } from '@kobato/web-client/editor/use-editor-body-reset'
import { useCallback, useState } from 'react'

export interface UseEditorSurfaceArgs<TBody extends SerializedEditorState> {
  initialBody: TBody
  bodyKey: string
  onBodyChange: (body: TBody) => void
  prepareSeed?: (body: TBody) => TBody
}

export interface EditorSurfaceHandle<TBody extends SerializedEditorState> {
  editorInstance: LexicalEditor | null
  registerAPI: (api: ExternalControlAPI | null) => void
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
