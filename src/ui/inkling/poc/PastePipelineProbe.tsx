import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor, SerializedEditorState } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { PASTE_COMMAND } from 'lexical'
import { forwardRef, useEffect, useImperativeHandle } from 'react'

import {
  normalizeSerializedTableShape,
  PASTE_PROBE_NODES,
  registerPasteProbeTransforms,
} from '@/ui/inkling/poc/paste-probe'

const theme: InitialConfigType['theme'] = {
  paragraph: 'inkling-paragraph',
  heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
  list: { ul: 'inkling-ul', ol: 'inkling-ol' },
  link: 'inkling-link',
}

export interface PastePipelineProbeHandle {
  /** Paste HTML through the editor's command path and return the serialized state. */
  pasteHtml(html: string): Promise<SerializedEditorState>
}

function PasteErrorBoundary({ children }: { children: React.ReactNode }): React.ReactNode {
  return children
}

function pasteHtmlThroughCommand(editor: LexicalEditor, html: string): Promise<SerializedEditorState> {
  const dataTransfer = new DataTransfer()
  dataTransfer.setData('text/html', html)
  const event = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      removeListener()
      reject(new Error('PastePipelineProbe paste timed out'))
    }, 5000)

    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      const children = editorState.toJSON().root.children
      if (children.length === 0) {
        return
      }
      const first = children[0]
      if (first && 'children' in first && Array.isArray(first.children) && first.children.length === 0) {
        return
      }

      clearTimeout(timeout)
      removeListener()
      resolve(normalizeSerializedTableShape(editorState.toJSON()))
    })

    editor.dispatchCommand(PASTE_COMMAND, event)
  })
}

const PasteProbeInner = forwardRef<PastePipelineProbeHandle>(function PasteProbeInner(_props, ref) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return registerPasteProbeTransforms(editor)
  }, [editor])

  useImperativeHandle(ref, () => ({
    pasteHtml: (html: string) => pasteHtmlThroughCommand(editor, html),
  }))

  return null
})

export const PastePipelineProbe = forwardRef<PastePipelineProbeHandle>(function PastePipelineProbe(_props, ref) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'inkling-paste-pipeline-probe',
        theme,
        onError: (error: Error) => {
          // eslint-disable-next-line no-console
          console.error('Paste pipeline probe error:', error)
        },
        nodes: PASTE_PROBE_NODES,
      }}
    >
      <PasteProbeInner ref={ref} />
      <RichTextPlugin
        contentEditable={<ContentEditable className="inkling-paste-probe__content" />}
        ErrorBoundary={PasteErrorBoundary}
      />
    </LexicalComposer>
  )
})
