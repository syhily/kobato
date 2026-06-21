import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { EditorState, ElementFormatType, LexicalEditor, SerializedEditorState } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { useCallback, useMemo } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { DecoratorErrorBoundary } from '@/ui/inkling/editor/decorator-error-boundary'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'
import { toLexicalChildren } from '@/ui/inkling/editor/shared/lexical-bridge'

const theme = {
  paragraph: 'inkling-paragraph',
  heading: {
    h1: 'inkling-h1',
    h2: 'inkling-h2',
    h3: 'inkling-h3',
    h4: 'inkling-h4',
  },
  list: {
    ul: 'inkling-ul',
    ol: 'inkling-ol',
  },
  link: 'inkling-link',
  quote: 'inkling-quote',
  code: 'inkling-code',
  text: {
    bold: 'inkling-text-bold',
    italic: 'inkling-text-italic',
    underline: 'inkling-text-underline',
    strikethrough: 'inkling-text-strikethrough',
    code: 'inkling-text-code',
  },
}

function buildInitialEditorState(document: InklingDocument): (editor: LexicalEditor) => void {
  return (editor: LexicalEditor) => {
    editor.setEditorState(editor.parseEditorState(inklingDocumentToEditorState(document)))
  }
}

function inklingDocumentToEditorState(document: InklingDocument): SerializedEditorState {
  const direction = document.root.direction ?? null
  const rawFormat = document.root.format ?? ''
  const format: ElementFormatType =
    rawFormat === '' ||
    rawFormat === 'left' ||
    rawFormat === 'center' ||
    rawFormat === 'right' ||
    rawFormat === 'justify'
      ? (rawFormat as ElementFormatType)
      : ''
  const indent = document.root.indent ?? 0
  return {
    root: {
      type: 'root',
      version: 1,
      direction,
      format,
      indent,
      textFormat: 0,
      textStyle: '',
      children: toLexicalChildren(document.root.children),
    },
  }
}

export interface InklingEditorProps {
  namespace: string
  nodes: InitialConfigType['nodes']
  document: InklingDocument
  onChange: (document: InklingDocument) => void
  editable?: boolean
  placeholder?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

export function InklingEditor({
  namespace,
  nodes,
  document,
  onChange,
  editable = true,
  placeholder,
  className,
  contentClassName,
  children,
}: InklingEditorProps) {
  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace,
      theme,
      onError: (error: Error) => {
        reportEditorError(error, namespace)
      },
      nodes,
      editable,
      editorState: buildInitialEditorState(document),
    }),
    [namespace, nodes, editable, document],
  )

  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(editorStateToInklingDocument(editorState))
    },
    [onChange],
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={className}>
        {/* `<RichTextPlugin>` mounts the decorator renderer
          (`<LegacyDecorators>`) that portals each card node's `decorate()`
          output into its host element. Without it, DecoratorNode-based cards
          (CodeBlock/MathBlock/InlineMath in comment mode) render empty hosts.
          `contentEditable` takes the `<ContentEditable>` as a prop (modern
          API) rather than a child. `ErrorBoundary` is required by this
          Lexical version's prop type.

          `ContentEditable`'s `placeholder` prop is a discriminated union:
          when `aria-placeholder` is set, `placeholder` must be a non-null
          Element (or render fn); when `aria-placeholder` is absent,
          `placeholder` must be null. So we only set `aria-placeholder` when
          we actually have a placeholder string to show.                    */}
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={contentClassName}
              {...(placeholder !== undefined
                ? {
                    'aria-placeholder': placeholder,
                    placeholder: <div className="inkling-placeholder text-muted-foreground">{placeholder}</div>,
                  }
                : { placeholder: null })}
            />
          }
          placeholder={null}
          ErrorBoundary={DecoratorErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} />
        {children}
      </div>
    </LexicalComposer>
  )
}
