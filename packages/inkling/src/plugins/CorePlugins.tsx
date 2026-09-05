import type { Transformer } from '@lexical/markdown'
import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { EditorState } from 'lexical'

import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { BLUR_COMMAND, FOCUS_COMMAND } from 'lexical'
import React from 'react'

import type { HiddenFormat } from '@/plugins/behaviour/format-toolbar'
import type { ExternalControlAPI } from '@/plugins/ExternalControlPlugin'

import InklingErrorBoundary from '@/components/InklingErrorBoundary'
import DragDropPastePlugin from '@/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@/plugins/DragDropReorderPlugin'
import { ExternalControlPlugin } from '@/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@/plugins/FloatingToolbarPlugin'
import InklingBehaviourPlugin from '@/plugins/InklingBehaviourPlugin'
import { InklingEditorEventPlugin } from '@/plugins/InklingEditorEventPlugin'
import MarkdownPastePlugin from '@/plugins/MarkdownPastePlugin'
import MarkdownShortcutPlugin from '@/plugins/MarkdownShortcutPlugin'
import RestrictContentPlugin from '@/plugins/RestrictContentPlugin'
import TKPlugin from '@/plugins/TKPlugin'

// The render-scope values InklingComposableEditor derives and the core plugin
// entries consume. Unlike DEFAULT_FEATURE_PLUGINS (whose entries take no
// props), the core set's props are per-instance — contexts, refs, derived
// flags — so they travel as one typed scope instead of being re-derived per
// entry.
export interface CorePluginScope {
  /** Wires the floating anchor element the toolbar plugin renders into. */
  contentEditableRef: (element: HTMLDivElement | null) => void
  contentEditableClassName: string
  readOnly: boolean
  /** The resolved placeholder element (host element or the default EditorPlaceholder). */
  placeholder: React.ReactElement
  /** The composable editor's change handler (shared + per-instance onChange). */
  onEditorChange: (editorState: EditorState) => void
  historyState: HistoryState
  isCollabActive: boolean
  containerElem: React.RefObject<HTMLElement | null>
  cursorDidExitAtTop?: () => void
  isNested: boolean
  alignment?: boolean
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

// A core plugin entry, as data. The explicit key keeps rendering stable
// without leaning on component names (which minification can collapse).
// `when` is the mount condition (omitted = always mounted); `render` carries
// the props the plugin takes. RichTextPlugin's contentEditable/placeholder
// contract is elements, not data, so its structure lives inside the render
// lambda — the one structural piece the entry shape deliberately does not
// decompose into props.
export interface CorePluginEntry {
  key: string
  when?: (scope: CorePluginScope) => boolean
  render: (scope: CorePluginScope) => React.ReactNode
}

// The core plugin set every InklingComposableEditor mounts, as data and in
// render order — the half of the default editor surface that used to be
// hardcoded JSX in InklingComposableEditor. The shipped default surface is
// CORE_PLUGINS (here) + DEFAULT_FEATURE_PLUGINS (./DefaultFeaturePlugins):
// one enumerable list, pinned by test/unit/plugins/derived-feature-plugin-sets.
// InklingEditorEventPlugin appears twice (blur/focus) as two entries — the
// two mounts differ only in props, not in kind.
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
    // adds undo/redo; in multiplayer that's handled by yjs
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
    // render re-narrows locally; the `when` guard above is the data-shaped
    // mount condition, this branch can only run with a non-null anchor
    render: ({ floatingAnchorElem, hiddenFormats, isSnippetsEnabled }) =>
      floatingAnchorElem ? (
        <FloatingToolbarPlugin
          anchorElem={floatingAnchorElem}
          hiddenFormats={hiddenFormats}
          isSnippetsEnabled={isSnippetsEnabled}
        />
      ) : null,
  },
  { key: 'drag-drop-paste', render: () => <DragDropPastePlugin /> },
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
