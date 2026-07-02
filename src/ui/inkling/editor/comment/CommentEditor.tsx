import type { EditorState, ElementFormatType, SerializedEditorState } from 'lexical'

import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useCallback, useMemo } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'
import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import InklingComposer from '@/ui/inkling-editor/components/InklingComposer'
import { SharedHistoryContext } from '@/ui/inkling-editor/context/SharedHistoryContext'
import { INKLING_COMMENT_MARKDOWN_TRANSFORMERS } from '@/ui/inkling/editor/behaviour/markdown-shortcuts'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { COMMENT_NODES } from '@/ui/inkling/editor/nodes/registry'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'
import { toLexicalChildren } from '@/ui/inkling/editor/shared/lexical-bridge'

/** Lexical theme classes styled by src/styles/inkling/core.css. Same set the
 *  article editor uses (headings unused — COMMENT_NODES has no HeadingNode). */
const theme = {
  paragraph: 'inkling-paragraph',
  list: { ul: 'inkling-ul', ol: 'inkling-ol' },
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
      children: toLexicalChildren(document.root.children),
    },
  }
}

export interface CommentInklingEditorProps {
  document: InklingDocument
  onChange: (document: InklingDocument) => void
  editable?: boolean
  placeholder?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

/**
 * Comment editor on the vendored inkling composer. Textarea-like by design:
 * no top toolbar; inline formats via the vendored floating toolbar on text
 * selection; list/quote via markdown shortcuts; code/math blocks via the
 * `CommentInsertActions` buttons passed as `children`.
 *
 * Unlike the article editor there is no debounced change plugin — the parent
 * form reads React state on submit, so every update serializes immediately
 * (comment documents are small; the merge/validate pass the article editor
 * needs does not apply here — the server validates comment feature-mode on
 * write).
 */
export function CommentInklingEditor({
  document,
  onChange,
  editable = true,
  placeholder,
  className,
  contentClassName,
  children,
}: CommentInklingEditorProps) {
  // Structurally a plain JSON object; the composer stringifies it. The cast
  // bridges Lexical's branded SerializedEditorState to the loose prop type.
  const initialEditorState = useMemo(
    () => unsafeCast<Record<string, unknown>>(inklingDocumentToEditorState(document)),
    [document],
  )

  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(editorStateToInklingDocument(editorState))
    },
    [onChange],
  )

  const darkMode =
    typeof globalThis !== 'undefined' && globalThis.document?.documentElement.classList.contains('dark') === true

  return (
    <InklingComposer
      nodes={COMMENT_NODES}
      initialEditorState={initialEditorState}
      theme={theme}
      darkMode={darkMode}
      isTKEnabled={false}
      onError={(error: Error) => {
        reportEditorError(error, 'comment')
      }}
    >
      <SharedHistoryContext>
        <InklingComposableEditor
          className={className ?? ''}
          contentClassName={contentClassName ?? ''}
          readOnly={editable !== true}
          inheritStyles
          isDragEnabled={false}
          isSnippetsEnabled={false}
          markdownTransformers={INKLING_COMMENT_MARKDOWN_TRANSFORMERS}
          {...(placeholder !== undefined ? { placeholderText: placeholder } : {})}
        >
          <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
          {children}
        </InklingComposableEditor>
      </SharedHistoryContext>
    </InklingComposer>
  )
}
