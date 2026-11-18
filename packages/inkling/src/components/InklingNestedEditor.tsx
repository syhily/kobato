import type { EditorThemeClasses, InitialEditorStateType, LexicalEditor } from 'lexical'

import InklingComposableEditor from '@kobato/inkling-internal/components/InklingComposableEditor'
import InklingNestedComposer from '@kobato/inkling-internal/components/InklingNestedComposer'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { BASIC_TRANSFORMERS, MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import BASIC_NODES from '@kobato/inkling-internal/nodes/BasicNodes'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import { type HiddenFormat } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import { EmojiPickerPlugin } from '@kobato/inkling-internal/plugins/EmojiPickerPlugin'
import InklingNestedEditorPlugin, {
  type FocusNextTarget,
} from '@kobato/inkling-internal/plugins/InklingNestedEditorPlugin'
import RestrictContentPlugin from '@kobato/inkling-internal/plugins/RestrictContentPlugin'
import React from 'react'

const Placeholder = ({ text = 'Type here', className = '' }) => {
  // line-clamp-1, not truncate: truncate adds 'white-space: nowrap', which
  // often breaks overflow in parent cards
  return (
    <div className={`placeholder not-inkling-prose pointer-events-none h-0 cursor-text overflow-visible`}>
      <div className={`xs:overflow-visible line-clamp-1 translate-y-[-100%] ${className}`}>{text}</div>
    </div>
  )
}

interface InklingNestedEditorProps {
  initialEditor: LexicalEditor
  initialEditorState?: InitialEditorStateType
  initialTheme?: EditorThemeClasses
  nodes?: 'basic' | 'minimal'
  placeholderText?: string
  textClassName?: string
  placeholderClassName?: string
  autoFocus?: boolean
  focusNext?: FocusNextTarget | null
  singleParagraph?: boolean
  hasSettingsPanel?: boolean
  defaultInklingEnterBehaviour?: boolean
  hiddenFormats?: HiddenFormat[]
  useDefaultClasses?: boolean
  dataTestId?: string
  children?: React.ReactNode
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
  // minimal surfaces (the host's comment composer) opt out of the emoji
  // typeahead through the composer's ui-prefs channel
  const { isEmojiEnabled } = React.useContext(InklingUiPrefsContext)

  return (
    <InklingNestedComposer
      initialEditor={initialEditor}
      initialEditorState={initialEditorState}
      // oxlint-disable-next-line typescript/no-deprecated -- load-bearing: the nested editor's node set arrives via this prop; see InklingNestedComposer
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

        {isEmojiEnabled !== false && <EmojiPickerPlugin />}
      </InklingComposableEditor>
    </InklingNestedComposer>
  )
}

export default InklingNestedEditor
