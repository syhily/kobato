import {
  BASIC_NODES,
  BASIC_TRANSFORMERS,
  InklingComposableEditor,
  InklingNestedComposer,
  MINIMAL_NODES,
  MINIMAL_TRANSFORMERS,
  RestrictContentPlugin,
} from '@/ui/inkling-editor/index'
import { EmojiPickerPlugin } from '@/ui/inkling-editor/plugins/EmojiPickerPlugin'
import InklingNestedEditorPlugin from '@/ui/inkling-editor/plugins/InklingNestedEditorPlugin'

const Placeholder = ({ text = 'Type here', className = '' }) => {
  // Note: we use line-clamp-1, instead of truncate because truncate adds 'white-space: nowrap', which often breaks overflows of parents in some cards
  return (
    <div className={`placeholder not-inkling-prose pointer-events-none h-0 cursor-text overflow-visible`}>
      <div className={`xs:overflow-visible line-clamp-1 translate-y-[-100%] ${className}`}>{text}</div>
    </div>
  )
}

import React from 'react'

interface InklingNestedEditorProps {
  initialEditor: import('lexical').LexicalEditor
  initialEditorState?: unknown
  initialTheme?: unknown
  nodes?: 'basic' | 'minimal'
  placeholderText?: string
  textClassName?: string
  placeholderClassName?: string
  autoFocus?: boolean
  focusNext?: { focus: (fn: () => void) => void; getRootElement: () => HTMLElement | null } | null
  singleParagraph?: boolean
  hasSettingsPanel?: boolean
  defaultInklingEnterBehaviour?: boolean
  hiddenFormats?: string[]
  useDefaultClasses?: boolean
  dataTestId?: string
  children?: React.ReactNode
  readOnly?: boolean
  style?: React.CSSProperties
}

const InklingNestedEditor = ({
  initialEditor,
  initialEditorState,
  initialTheme,
  nodes = 'basic',
  placeholderText = '',
  textClassName = '',
  placeholderClassName = '',
  autoFocus = false,
  focusNext = null,
  singleParagraph = false,
  hasSettingsPanel = false,
  defaultInklingEnterBehaviour = false,
  hiddenFormats = [],
  useDefaultClasses = true,
  dataTestId,
  children,
}: InklingNestedEditorProps) => {
  const initialNodes = nodes === 'minimal' ? MINIMAL_NODES : BASIC_NODES
  const markdownTransformers = nodes === 'minimal' ? MINIMAL_TRANSFORMERS : BASIC_TRANSFORMERS

  return (
    <InklingNestedComposer
      initialEditor={initialEditor}
      initialEditorState={initialEditorState}
      initialNodes={initialNodes}
      initialTheme={initialTheme}
    >
      <InklingComposableEditor
        className={textClassName}
        dataTestId={dataTestId}
        hiddenFormats={hiddenFormats}
        inheritStyles={true}
        isDragEnabled={false}
        markdownTransformers={markdownTransformers}
        placeholder={<Placeholder className={placeholderClassName} text={placeholderText} />}
        useDefaultClasses={useDefaultClasses}
      >
        {singleParagraph && <RestrictContentPlugin paragraphs={1} />}

        {children}

        <InklingNestedEditorPlugin
          autoFocus={autoFocus}
          defaultInklingEnterBehaviour={defaultInklingEnterBehaviour}
          focusNext={focusNext}
          hasSettingsPanel={hasSettingsPanel}
        />

        <EmojiPickerPlugin />
      </InklingComposableEditor>
    </InklingNestedComposer>
  )
}

export default InklingNestedEditor
