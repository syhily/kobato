import type { HiddenFormat } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import type { ExternalControlAPI } from '@kobato/inkling-internal/plugins/ExternalControlPlugin'
import type { Transformer } from '@lexical/markdown'
import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { EditorState } from 'lexical'

import InklingErrorBoundary from '@kobato/inkling-internal/components/InklingErrorBoundary'
import CardPickerHostPlugin from '@kobato/inkling-internal/plugins/CardPickerHostPlugin'
import DragDropPastePlugin from '@kobato/inkling-internal/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@kobato/inkling-internal/plugins/DragDropReorderPlugin'
import { ExternalControlPlugin } from '@kobato/inkling-internal/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@kobato/inkling-internal/plugins/FloatingToolbarPlugin'
import FocusModePlugin from '@kobato/inkling-internal/plugins/FocusModePlugin'
import InklingAutoLinkPlugin from '@kobato/inkling-internal/plugins/InklingAutoLinkPlugin'
import InklingBehaviourPlugin from '@kobato/inkling-internal/plugins/InklingBehaviourPlugin'
import { InklingEditorEventPlugin } from '@kobato/inkling-internal/plugins/InklingEditorEventPlugin'
import MarkdownPastePlugin from '@kobato/inkling-internal/plugins/MarkdownPastePlugin'
import MarkdownShortcutPlugin from '@kobato/inkling-internal/plugins/MarkdownShortcutPlugin'
import RestrictContentPlugin from '@kobato/inkling-internal/plugins/RestrictContentPlugin'
import TKPlugin from '@kobato/inkling-internal/plugins/TKPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { BLUR_COMMAND, FOCUS_COMMAND } from 'lexical'
import React from 'react'

export interface CorePluginScope {
  contentEditableRef: (element: HTMLDivElement | null) => void
  contentEditableClassName: string
  readOnly: boolean
  placeholder: React.ReactElement

  onEditorChange: (editorState: EditorState) => void
  historyState: HistoryState
  isCollabActive: boolean
  containerElem: React.RefObject<HTMLElement | null>
  cursorDidExitAtTop?: () => void
  isNested: boolean
  alignment?: boolean
  focusMode?: boolean
  markdownTransformers?: readonly Transformer[]
  floatingAnchorElem: HTMLDivElement | null
  hiddenFormats: HiddenFormat[]
  isSnippetsEnabled: boolean
  registerAPI?: (api: ExternalControlAPI | null) => void
  isDragReorderEnabled: boolean
  singleParagraph?: boolean
  onBlur?: () => void
  onFocus?: () => void
  isTKEnabled?: boolean
}

export interface CorePluginEntry {
  key: string
  when?: (scope: CorePluginScope) => boolean
  render: (scope: CorePluginScope) => React.ReactNode
}

export const CORE_PLUGINS: readonly CorePluginEntry[] = [
  {
    key: 'rich-text',
    render: (scope) => (
      <RichTextPlugin
        contentEditable={
          <div ref={scope.contentEditableRef} data-inkling="editor">
            <ContentEditable className={scope.contentEditableClassName} readOnly={scope.readOnly} />
          </div>
        }
        ErrorBoundary={InklingErrorBoundary}
        placeholder={scope.placeholder}
      />
    ),
  },
  { key: 'link', render: () => <LinkPlugin /> },

  { key: 'autolink', render: () => <InklingAutoLinkPlugin /> },
  {
    key: 'on-change',
    render: (scope) => (
      <OnChangePlugin
        ignoreHistoryMergeTagChange={false}
        ignoreSelectionChange={true}
        onChange={scope.onEditorChange}
      />
    ),
  },
  {
    key: 'history',
    when: (scope) => !scope.isCollabActive,
    render: (scope) => <HistoryPlugin externalHistoryState={scope.historyState} />,
  },
  {
    key: 'behaviour',
    render: (scope) => (
      <InklingBehaviourPlugin
        containerElem={scope.containerElem}
        cursorDidExitAtTop={scope.cursorDidExitAtTop}
        isNested={scope.isNested}
        alignment={scope.alignment}
      />
    ),
  },
  {
    key: 'markdown-shortcut',
    render: (scope) => <MarkdownShortcutPlugin transformers={scope.markdownTransformers} />,
  },
  {
    key: 'floating-toolbar',
    when: (scope) => scope.floatingAnchorElem !== null,

    render: ({ floatingAnchorElem, hiddenFormats, isSnippetsEnabled, alignment }) =>
      floatingAnchorElem ? (
        <FloatingToolbarPlugin
          anchorElem={floatingAnchorElem}
          hiddenFormats={hiddenFormats}
          isAlignmentEnabled={alignment === true}
          isSnippetsEnabled={isSnippetsEnabled}
        />
      ) : null,
  },
  { key: 'drag-drop-paste', render: () => <DragDropPastePlugin /> },
  {
    key: 'card-picker-host',

    when: (scope) => !scope.isNested && !scope.readOnly,
    render: () => <CardPickerHostPlugin />,
  },
  {
    key: 'external-control',
    when: (scope) => scope.registerAPI !== undefined,
    render: ({ registerAPI }) => (registerAPI ? <ExternalControlPlugin registerAPI={registerAPI} /> : null),
  },
  {
    key: 'drag-drop-reorder',
    when: (scope) => scope.isDragReorderEnabled,
    render: () => <DragDropReorderPlugin />,
  },
  {
    key: 'restrict-content',
    when: (scope) => scope.singleParagraph === true,
    render: () => <RestrictContentPlugin paragraphs={1} />,
  },
  {
    key: 'editor-event-blur',
    when: (scope) => scope.onBlur !== undefined,
    render: ({ onBlur }) => (onBlur ? <InklingEditorEventPlugin command={BLUR_COMMAND} onEvent={onBlur} /> : null),
  },
  {
    key: 'editor-event-focus',
    when: (scope) => scope.onFocus !== undefined,
    render: ({ onFocus }) => (onFocus ? <InklingEditorEventPlugin command={FOCUS_COMMAND} onEvent={onFocus} /> : null),
  },
  { key: 'markdown-paste', render: () => <MarkdownPastePlugin /> },
  {
    key: 'tk',
    when: (scope) => scope.isTKEnabled === true,
    render: () => <TKPlugin />,
  },
  {
    key: 'focus-mode',

    when: (scope) => scope.focusMode === true,
    render: () => <FocusModePlugin />,
  },
]

export const CorePlugins = ({ scope }: { scope: CorePluginScope }) => {
  return (
    <>
      {CORE_PLUGINS.map(({ key, when, render }) =>
        when && !when(scope) ? null : <React.Fragment key={key}>{render(scope)}</React.Fragment>,
      )}
    </>
  )
}

export default CorePlugins
