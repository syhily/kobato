import type { EditorState, LexicalEditor, NodeKey } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import type { FootnoteDefinitionNode } from '@/nodes/FootnoteDefinitionNode'

import InklingNestedEditor from '@/components/InklingNestedEditor'
import { useFootnoteHandle, useFootnoteHandleState } from '@/context/FootnoteHandleContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { $removeFootnote } from '@/plugins/behaviour/footnotes'

export interface FootnoteDefinitionNodeComponentProps {
  nodeKey: NodeKey
  targetKey: string
  contentEditor: LexicalEditor
  contentEditorInitialState?: EditorState | undefined
}

/**
 * The definition card's chrome: one "footnotes section" row — the citation
 * number badge (from the footnote handle, matching the exported `<li>`
 * anchor), the content nested editor, and the delete button. Deleting goes
 * through `$removeFootnote` so the citing refs go with the definition; the
 * card's own action toolbar is suppressed — this row IS the whole UI.
 */
export function FootnoteDefinitionNodeComponent({
  targetKey,
  contentEditor,
  contentEditorInitialState,
}: FootnoteDefinitionNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const footnoteHandle = useFootnoteHandle()
  const labels = useInklingLabels()
  const index = useFootnoteHandleState((state) => state.indices[targetKey] ?? 0)
  const focusRequest = useFootnoteHandleState((state) => state.focusRequest)

  // Focus handoff: the caret trigger files a request for its fresh
  // definition (the nested editor doesn't exist at insert time); the row
  // claims it once mounted and clears it. `defaultSelection: 'rootEnd'`
  // places the caret at the content's end (0.46's focus callback runs
  // without an active editor state — no $-helpers allowed inside).
  React.useEffect(() => {
    if (focusRequest?.targetKey !== targetKey) {
      return
    }
    contentEditor.focus(() => {}, { defaultSelection: 'rootEnd' })
    footnoteHandle.setState({ focusRequest: null })
  }, [focusRequest, targetKey, contentEditor, footnoteHandle])

  const handleDelete = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      editor.update(() => {
        $removeFootnote(targetKey)
      })
    },
    [editor, targetKey],
  )

  return (
    <div className="inkling-footnote-definition flex items-baseline gap-2" data-inkling-footnote-definition="true">
      <span
        className="inkling-footnote-definition-index shrink-0 text-sm text-grey-500"
        data-inkling-footnote-definition-index="true"
      >
        {index}.
      </span>
      <div className="inkling-footnote-definition-content w-full">
        <InklingNestedEditor
          dataTestId="footnote-definition-content"
          initialEditor={contentEditor}
          initialEditorState={contentEditorInitialState}
          nodes="basic"
          placeholderText={labels['footnote.content.placeholder']}
        />
      </div>
      <button
        aria-label={labels['aria.deleteFootnote']}
        className="inkling-footnote-definition-delete flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-grey-400 hover:text-grey-700 dark:hover:text-grey-200"
        data-inkling-allow-clickthrough="true"
        data-inkling-footnote-definition-delete="true"
        onClick={handleDelete}
        type="button"
      >
        ×
      </button>
    </div>
  )
}

/**
 * The footnote definition's decorate render — the React-bearing half of its
 * decorate-target, paired with the declaration by
 * `@/nodes/cards/card-decorate`.
 */
export function renderFootnoteDefinitionCard(node: FootnoteDefinitionNode) {
  // Same headless-round-trip invariant as toggle's nested editors: null only
  // inside an editor that never reconciles decorators — guard so the field
  // type stays honest.
  if (!node.__contentEditor) {
    return null
  }

  return (
    <FootnoteDefinitionNodeComponent
      contentEditor={node.__contentEditor}
      contentEditorInitialState={node.__contentEditorInitialState}
      nodeKey={node.getKey()}
      targetKey={node.targetKey}
    />
  )
}
