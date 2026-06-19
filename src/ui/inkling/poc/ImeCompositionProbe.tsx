import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

import { ListNode, ListItemNode } from '@lexical/list'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setSelection,
  ParagraphNode,
  TextNode,
} from 'lexical'
import { forwardRef, useCallback, useImperativeHandle } from 'react'

import { $createFootnoteRefNode, FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

export interface ImeCompositionProbeHandle {
  insertFootnoteRefAtOffset(paragraphIndex: number, offset: number, index?: number): void
  setCaretAtOffset(paragraphIndex: number, childIndex: number, offset: number): void
  getSerializedState(): SerializedEditorState
}

export interface ImeCompositionProbeProps {
  initialEditorState: SerializedEditorState
  onChange: (editorState: SerializedEditorState) => void
}

const theme = {
  paragraph: 'inkling-paragraph',
  list: {
    ul: 'inkling-ul',
    ol: 'inkling-ol',
  },
}

function ImeCompositionProbeEditor({
  onChange,
  probeRef,
}: {
  onChange: (editorState: SerializedEditorState) => void
  probeRef: React.Ref<ImeCompositionProbeHandle>
}) {
  const [editor] = useLexicalComposerContext()

  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(editorState.toJSON())
    },
    [onChange],
  )

  useImperativeHandle(probeRef, (): ImeCompositionProbeHandle => {
    return {
      insertFootnoteRefAtOffset(paragraphIndex: number, offset: number, index = 1): void {
        editor.update(
          () => {
            const root = $getRoot()
            const paragraph = root.getChildAtIndex(paragraphIndex)
            if (!$isCompositionProbeParagraph(paragraph)) {
              return
            }
            const children = paragraph.getChildren()
            let accumulated = 0
            for (const child of children) {
              const length = $isTextNode(child) ? child.getTextContentSize() : 1
              const refNode = $createFootnoteRefNode('target-key', 'ref-key', index)
              if (accumulated + length === offset) {
                // Insert exactly at the boundary after this child.
                child.insertAfter(refNode)
                return
              }
              if (accumulated + length > offset && $isTextNode(child)) {
                // Offset falls inside a text node: split and insert between halves.
                const splitOffset = offset - accumulated
                const [, right] = child.splitText(splitOffset)
                right.insertBefore(refNode)
                return
              }
              accumulated += length
            }
            // Append at the end of the paragraph.
            const refNode = $createFootnoteRefNode('target-key', 'ref-key', index)
            paragraph.append(refNode)
          },
          { discrete: true },
        )
      },
      setCaretAtOffset(paragraphIndex: number, childIndex: number, offset: number): void {
        editor.update(
          () => {
            const root = $getRoot()
            const paragraph = root.getChildAtIndex(paragraphIndex)
            if (!$isCompositionProbeParagraph(paragraph)) {
              return
            }
            const child = paragraph.getChildAtIndex(childIndex)
            if (child === null) {
              return
            }
            const selection = $createRangeSelection()
            if ($isTextNode(child)) {
              selection.anchor.set(child.getKey(), offset, 'text')
              selection.focus.set(child.getKey(), offset, 'text')
            } else {
              const nextSibling = child.getNextSibling()
              if (nextSibling !== null && $isTextNode(nextSibling)) {
                selection.anchor.set(nextSibling.getKey(), 0, 'text')
                selection.focus.set(nextSibling.getKey(), 0, 'text')
              } else {
                const textNode = $createTextNode('')
                child.insertAfter(textNode)
                selection.anchor.set(textNode.getKey(), 0, 'text')
                selection.focus.set(textNode.getKey(), 0, 'text')
              }
            }
            $setSelection(selection)
          },
          { discrete: true },
        )
      },
      getSerializedState(): SerializedEditorState {
        return editor.getEditorState().toJSON()
      },
    }
  }, [editor])

  return (
    <>
      <ContentEditable className="inkling-content-editable" />
      <OnChangePlugin onChange={handleChange} />
      <HistoryPlugin />
    </>
  )
}

function $isCompositionProbeParagraph(node: unknown): node is ReturnType<typeof $createParagraphNode> {
  return node instanceof ParagraphNode
}

export const ImeCompositionProbe = forwardRef<ImeCompositionProbeHandle, ImeCompositionProbeProps>(
  function ImeCompositionProbe({ initialEditorState, onChange }, ref) {
    const initialConfig: InitialConfigType = {
      namespace: 'inkling-ime-composition-probe',
      theme,
      onError: (error: Error) => {
        // eslint-disable-next-line no-console
        console.error('IME composition probe error:', error)
      },
      nodes: [ParagraphNode, TextNode, ListNode, ListItemNode, FootnoteRefNode],
      editorState: (editor: LexicalEditor) => {
        editor.setEditorState(editor.parseEditorState(initialEditorState))
      },
    }

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <div className="inkling-ime-composition-probe">
          <ImeCompositionProbeEditor onChange={onChange} probeRef={ref} />
        </div>
      </LexicalComposer>
    )
  },
)
